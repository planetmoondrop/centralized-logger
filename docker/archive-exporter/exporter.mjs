#!/usr/bin/env node
/**
 * Moondrop Archive Exporter
 *
 * Runs as a cron inside Docker. Called twice per day:
 *   - At 00:05 UTC  → exports the previous day's PM window (12:00–24:00)
 *   - At 12:05 UTC  → exports the current day's AM window (00:00–12:00)
 *
 * Output: /archive/YYYY-MM-DD-<am|pm>.jsonl.gz
 *
 * Each line in the JSONL file is a Loki log entry in the format:
 *   { "labels": {...}, "timestamp": "RFC3339nano", "line": "raw log string" }
 *
 * This format is the exact input expected by moondrop-archive-import.mjs,
 * which can re-push the entries back into Loki with archive=true labels.
 *
 * Environment variables:
 *   LOKI_HOST      — Loki base URL (default http://loki:3100)
 *   ARCHIVE_DIR    — directory to write archives to (default /archive)
 *   ARCHIVE_TZ     — IANA timezone for window boundaries (default UTC)
 *   ARCHIVE_WINDOW — 'am' or 'pm', auto-detected from current UTC hour if omitted
 *   LOG_LIMIT      — max lines per sub-batch query (default 5000)
 */

import { createWriteStream, mkdirSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import https from 'node:https';
import http from 'node:http';

const LOKI_HOST   = process.env['LOKI_HOST']      ?? 'http://loki:3100';
const ARCHIVE_DIR = process.env['ARCHIVE_DIR']    ?? '/archive';
const WINDOW      = process.env['ARCHIVE_WINDOW'];     // 'am' | 'pm' | undefined
const LIMIT       = Number(process.env['LOG_LIMIT'] ?? '5000');

// ─── Timezone-aware window boundaries ─────────────────────────────────────────
function windowBoundaries() {
  const now = new Date();
  const utcHour = now.getUTCHours();

  // auto-detect: if we are past noon, the completed window is AM; else PM of previous day
  const window = WINDOW ?? (utcHour >= 12 ? 'am' : 'pm');

  let dateStr, startMs, endMs;

  if (window === 'am') {
    // AM window: today 00:00–12:00 UTC
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    dateStr  = toDateStr(d);
    startMs  = d.getTime();
    endMs    = startMs + 12 * 60 * 60 * 1000;
  } else {
    // PM window: yesterday 12:00–24:00 UTC
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const d = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 12, 0, 0, 0));
    dateStr  = toDateStr(yesterday);
    startMs  = d.getTime();
    endMs    = startMs + 12 * 60 * 60 * 1000;
  }

  return { window, dateStr, startNs: BigInt(startMs) * 1_000_000n, endNs: BigInt(endMs) * 1_000_000n };
}

function toDateStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function get(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Loki responded ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 200)}`));
        } else {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        }
      });
    }).on('error', reject);
  });
}

// ─── Fetch all app stream selectors ──────────────────────────────────────────
async function getStreams(startNs, endNs) {
  const url = `${LOKI_HOST}/loki/api/v1/series?match[]={app%3D~".%2B"}&start=${startNs}&end=${endNs}`;
  try {
    const data = await get(url);
    // Return unique stream selectors as {app, env, ...} objects
    return (data.data ?? []).filter((s) => !s.archive); // skip already-archived streams
  } catch (err) {
    console.warn(`[exporter] Could not fetch stream list: ${err.message} — falling back to broad selector`);
    return [{ app: '.+' }];
  }
}

// ─── Query a single stream with pagination ───────────────────────────────────
async function* queryStream(labels, startNs, endNs) {
  // Build selector from label object, e.g. {app="auth-service",env="production"}
  const selector = '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}';
  const encodedSelector = encodeURIComponent(selector);

  let cursor = startNs;

  while (cursor < endNs) {
    const url =
      `${LOKI_HOST}/loki/api/v1/query_range` +
      `?query=${encodedSelector}` +
      `&start=${cursor}` +
      `&end=${endNs}` +
      `&limit=${LIMIT}` +
      `&direction=forward`;

    let data;
    try {
      data = await get(url);
    } catch (err) {
      console.error(`[exporter] query_range failed for ${selector}: ${err.message}`);
      break;
    }

    const result = data?.data?.result ?? [];
    if (result.length === 0) break;

    let lastTs = cursor;
    for (const stream of result) {
      for (const [ts, line] of (stream.values ?? [])) {
        const tsNs = BigInt(ts);
        if (tsNs < startNs || tsNs >= endNs) continue;
        yield { labels: stream.labels, timestamp: ts, line };
        if (tsNs > lastTs) lastTs = tsNs;
      }
    }

    // If we got fewer than LIMIT entries the window is exhausted
    const totalLines = result.reduce((s, r) => s + (r.values?.length ?? 0), 0);
    if (totalLines < LIMIT) break;

    // Advance cursor by 1ns to avoid re-fetching the last entry
    cursor = lastTs + 1n;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { window, dateStr, startNs, endNs } = windowBoundaries();
  const filename = `${dateStr}-${window}.jsonl.gz`;
  const outPath  = `${ARCHIVE_DIR}/${filename}`;

  mkdirSync(ARCHIVE_DIR, { recursive: true });

  console.log(`[exporter] Starting archive: ${filename}`);
  console.log(`[exporter] Window: ${new Date(Number(startNs / 1_000_000n)).toISOString()} → ${new Date(Number(endNs / 1_000_000n)).toISOString()}`);
  console.log(`[exporter] Loki: ${LOKI_HOST}`);

  // Collect all streams active in this window
  const streams = await getStreams(startNs, endNs);
  console.log(`[exporter] Streams found: ${streams.length}`);

  // Write JSONL to a gzip file
  let lineCount = 0;
  const lines = [];

  for (const labels of streams) {
    for await (const entry of queryStream(labels, startNs, endNs)) {
      lines.push(JSON.stringify(entry));
      lineCount++;
      if (lineCount % 10_000 === 0) {
        console.log(`[exporter] Collected ${lineCount} lines...`);
      }
    }
  }

  if (lineCount === 0) {
    console.log('[exporter] No log lines found for this window — skipping file creation.');
    return;
  }

  // Stream lines into gzip file
  const source = Readable.from(lines.map((l) => l + '\n'));
  const dest   = createWriteStream(outPath);
  const gz     = createGzip({ level: 9 });

  await pipeline(source, gz, dest);

  console.log(`[exporter] Done. ${lineCount} lines → ${outPath}`);
}

main().catch((err) => {
  console.error('[exporter] Fatal:', err);
  process.exit(1);
});
