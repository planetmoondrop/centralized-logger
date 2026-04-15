#!/usr/bin/env node
/**
 * Planetmoondrop Archive Import — re-ingest a gzip archive back into Loki
 *
 * This script lives in docker/archive-exporter/ alongside the exporter.
 * Run it from your project root whenever you want to load an archive
 * file back into Loki so you can query it in Grafana.
 *
 * Usage:
 *   node docker/archive-exporter/import.mjs \
 *     --file ./docker/archive/logs/2026-03-15-am.jsonl.gz
 *
 *   # Or with explicit options:
 *   node docker/archive-exporter/import.mjs \
 *     --file 2026-03-15-pm.jsonl.gz \
 *     --loki http://localhost:3100 \
 *     --batch-size 500
 *
 * The file is read fully into memory, grouped by Loki stream with sorted label keys,
 * timestamps sorted ascending per stream, then pushed in chunks (avoids Loki
 * "entry too far behind" / out-of-order rejections).
 *
 * After import, view logs in Grafana Explore with:
 *   {archive="true"}                          ← all archived logs
 *   {archive="true", archive_date="2026-03-15"}
 *   {archive="true", archive_window="am"}
 *   {archive="true", app="auth-service"}
 *
 * Environment overrides (all optional):
 *   LOKI_HOST           default http://localhost:3100
 *   ARCHIVE_BATCH_SIZE  default 500 lines per push request
 *   LOKI_API_KEY        if set, sent as X-Scope-OrgID header (multi-tenant)
 */

import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import https from 'node:https';
import http from 'node:http';
import { basename } from 'node:path';

// ─── Argument parsing ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file')       args.file      = argv[i + 1];
    if (argv[i] === '--loki')       args.loki      = argv[i + 1];
    if (argv[i] === '--batch-size') args.batchSize = Number(argv[i + 1]);
    if (argv[i] === '--dry-run')    args.dryRun    = true;
    if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.file) {
  console.log(`
  Planetmoondrop Archive Import

  Re-ingests a Planetmoondrop gzip archive (.jsonl.gz) into Loki with archive labels,
  so you can query old logs in Grafana like any other log stream.

  Usage:
    node docker/archive-exporter/import.mjs --file <path-to-archive.jsonl.gz> [options]

  Options:
    --file <path>       Path to the .jsonl.gz archive file  (required)
    --loki <url>        Loki base URL  (default: $LOKI_HOST or http://localhost:3100)
    --batch-size <n>    Lines per push request  (default: 500)
    --dry-run           Parse and print stats without pushing to Loki
    --help, -h          Show this help

  After import, query in Grafana Explore:
    {archive="true"}
    {archive="true", archive_date="2026-03-15"}
    {archive="true", archive_window="am", app="auth-service"}
  `);
  process.exit(args.help ? 0 : 1);
}

const LOKI_HOST  = args.loki      ?? process.env['LOKI_HOST']            ?? 'http://localhost:3100';
const BATCH_SIZE = args.batchSize ?? Number(process.env['ARCHIVE_BATCH_SIZE'] ?? '500');
const API_KEY    = process.env['LOKI_API_KEY'];
const DRY_RUN    = args.dryRun ?? false;

// ─── Infer archive_date + archive_window from filename ────────────────────────
// Expected filename format: YYYY-MM-DD-am.jsonl.gz  or  YYYY-MM-DD-pm.jsonl.gz
function inferFromFilename(file) {
  const name = basename(file);
  const m = name.match(/^(\d{4}-\d{2}-\d{2})-(am|pm)/);
  return m ? { archive_date: m[1], archive_window: m[2] } : {};
}

// ─── HTTP push to Loki ────────────────────────────────────────────────────────
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const parsed  = new URL(url);
    const mod     = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'Content-Type':   'application/json',
      'Content-Length': String(payload.length),
    };
    if (API_KEY) headers['X-Scope-OrgID'] = API_KEY;

    const req = mod.request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'POST', headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Loki push failed ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 300)}`));
          } else {
            resolve();
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Stable label map key (same logical stream regardless of key order) ─────
function canonicalStream(labels, archiveMeta) {
  const merged = { ...labels, ...archiveMeta };
  const stream = {};
  for (const k of Object.keys(merged).sort()) {
    stream[k] = merged[k];
  }
  return stream;
}

// ─── Group by stream, sort timestamps ascending (Loki rejects out-of-order) ───
function buildStreams(batch, archiveMeta) {
  const map = new Map();

  for (const entry of batch) {
    const stream = canonicalStream(entry.labels, archiveMeta);
    const key = JSON.stringify(stream);
    if (!map.has(key)) {
      map.set(key, { stream, values: [] });
    }
    map.get(key).values.push([String(entry.timestamp), entry.line]);
  }

  for (const s of map.values()) {
    s.values.sort((a, b) => {
      const x = BigInt(a[0]);
      const y = BigInt(b[0]);
      if (x < y) return -1;
      if (x > y) return 1;
      return 0;
    });
  }

  return Array.from(map.values());
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(args.file)) {
    console.error(`File not found: ${args.file}`);
    process.exit(1);
  }

  const { archive_date, archive_window } = inferFromFilename(args.file);
  const archiveMeta = {
    archive:        'true',
    ...(archive_date   && { archive_date }),
    ...(archive_window && { archive_window }),
  };

  console.log(`[import] File:    ${args.file}`);
  console.log(`[import] Loki:    ${LOKI_HOST}`);
  console.log(`[import] Labels:  ${JSON.stringify(archiveMeta)}`);
  console.log(`[import] Batch:   ${BATCH_SIZE} lines`);
  if (DRY_RUN) console.log('[import] DRY RUN — no data will be pushed');
  console.log('');

  const gunzip = createGunzip();
  const fileStream = createReadStream(args.file);
  const rl = createInterface({ input: fileStream.pipe(gunzip), crlfDelay: Infinity });

  /** Full file first — avoids cross-batch out-of-order for the same Loki stream. */
  const entries = [];
  for await (const rawLine of rl) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      console.warn(`[import] Skipping malformed line: ${trimmed.slice(0, 80)}`);
    }
  }

  const totalLines = entries.length;
  let pushedBatches = 0;
  let errors = 0;

  const streams = buildStreams(entries, archiveMeta);

  if (!DRY_RUN) {
    for (const s of streams) {
      for (let i = 0; i < s.values.length; i += BATCH_SIZE) {
        const chunk = s.values.slice(i, i + BATCH_SIZE);
        try {
          await postJSON(`${LOKI_HOST}/loki/api/v1/push`, { streams: [{ stream: s.stream, values: chunk }] });
          pushedBatches++;
        } catch (err) {
          console.error(`[import] Push error (${s.stream.app ?? 'stream'} chunk ${pushedBatches + 1}): ${err.message}`);
          errors++;
        }
      }
    }
  } else {
    pushedBatches = streams.reduce((n, s) => n + Math.ceil(s.values.length / BATCH_SIZE), 0);
  }

  console.log(`\n[import] Complete — ${totalLines} lines, ${pushedBatches} batches, ${errors} errors`);
  if (errors > 0) {
    console.warn('[import] Some batches failed. Check Loki connectivity and re-run.');
    process.exit(1);
  }

  if (!DRY_RUN) {
    console.log('');
    console.log('[import] View in Grafana Explore → Loki:');
    console.log(`  {archive="true"}${archive_date ? ` + archive_date="${archive_date}"` : ''}`);
  }
}

main().catch((err) => {
  console.error('[import] Fatal:', err.message);
  process.exit(1);
});
