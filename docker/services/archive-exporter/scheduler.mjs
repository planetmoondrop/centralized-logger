#!/usr/bin/env node
/**
 * Runs exporter.mjs at the same UTC times as the former dcron setup (no setpgid):
 *   00:05 — PM window export
 *   12:05 — AM window export
 */
import { spawn } from 'node:child_process';

function nextDelayMs() {
  const now = Date.now();
  const d = new Date(now);
  const utcMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    0,
    5,
    0,
    0,
  );
  const utcNoon = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    12,
    5,
    0,
    0,
  );
  const candidates = [utcMidnight, utcNoon].filter((t) => t > now);
  const next =
    candidates.length > 0
      ? Math.min(...candidates)
      : Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate() + 1,
          0,
          5,
          0,
          0,
        );
  return next - now;
}

function runExporter() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['/app/exporter.mjs'], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`exporter signal ${signal}`));
      else if (code !== 0) reject(new Error(`exporter exited ${code}`));
      else resolve();
    });
  });
}

function schedule() {
  const ms = nextDelayMs();
  const when = new Date(Date.now() + ms).toISOString();
  console.log(`[scheduler] Next export in ${Math.round(ms / 1000)}s (${when})`);
  setTimeout(async () => {
    try {
      await runExporter();
    } catch (err) {
      console.error('[scheduler] Export failed:', err);
    }
    schedule();
  }, ms);
}

console.log('[scheduler] Planetmoondrop archive exporter (Node scheduler, UTC 00:05 & 12:05)');
schedule();
