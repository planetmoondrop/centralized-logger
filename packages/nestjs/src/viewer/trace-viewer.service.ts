import { Injectable, Inject } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { LOKI_LOGGER_OPTIONS, LokiLoggerOptions } from '../interfaces';

export interface SpanLog {
  timestamp: string;
  level: string;
  message: string;
  logType: string;
  context?: string;
  sequence: number;
  duration?: number;
  query?: string;
  parameters?: unknown[];
  statusCode?: number;
  event?: string;
  [key: string]: unknown;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  service: string;
  method: string;
  path: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  statusCode?: number;
  userId?: string;
  logs: SpanLog[];
  children?: Span[];
}

export interface TraceResult {
  traceId: string;
  startTime: string;
  durationMs: number;
  services: string[];
  spans: Span[]; // Flat list (all spans)
  rootSpans: Span[]; // Tree (only root spans, children nested inside)
}

interface LokiQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      stream: Record<string, string>;
      values: Array<[string, string]>;
    }>;
  };
}

@Injectable()
export class TraceViewerService {
  constructor(@Inject(LOKI_LOGGER_OPTIONS) private readonly options: LokiLoggerOptions) {}

  async getTrace(traceId: string): Promise<TraceResult | null> {
    const services = this.options.traceViewerServices ?? this.options.serviceName;
    // Query last 24h by default
    const endNs = BigInt(Date.now()) * 1_000_000n;
    const startNs = endNs - BigInt(24 * 60 * 60 * 1_000_000_000);

    // Build LogQL: query all configured services for this traceId
    const appMatcher = services.includes(',')
      ? `app=~"${services
          .split(',')
          .map((s) => s.trim())
          .join('|')}"`
      : `app="${services}"`;

    const query = `{${appMatcher}} | json | traceId="${traceId}"`;

    const rawLogs = await this.queryLoki(query, startNs.toString(), endNs.toString());
    if (!rawLogs || rawLogs.length === 0) return null;

    return this.buildTraceResult(traceId, rawLogs);
  }

  // ─── Loki HTTP Query ─────────────────────────────────────────────

  private queryLoki(query: string, start: string, end: string, limit = 1000): Promise<SpanLog[]> {
    return new Promise((resolve) => {
      const lokiUrl = new URL(this.options.lokiHost);
      const isHttps = lokiUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const params = new URLSearchParams({
        query,
        start,
        end,
        limit: String(limit),
        direction: 'forward',
      });

      const path = `/loki/api/v1/query_range?${params.toString()}`;

      const req = lib.request(
        {
          hostname: lokiUrl.hostname,
          port: lokiUrl.port || (isHttps ? 443 : 80),
          path,
          method: 'GET',
          headers: { Accept: 'application/json' },
          timeout: 10_000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            try {
              const result: LokiQueryResult = JSON.parse(body) as LokiQueryResult;
              const logs = this.parseLokiResult(result);
              resolve(logs);
            } catch {
              resolve([]);
            }
          });
        },
      );

      req.on('error', () => resolve([]));
      req.on('timeout', () => {
        req.destroy();
        resolve([]);
      });
      req.end();
    });
  }

  private parseLokiResult(result: LokiQueryResult): SpanLog[] {
    if (result.status !== 'success') return [];

    const logs: SpanLog[] = [];
    for (const stream of result.data.result) {
      for (const [tsNs, line] of stream.values) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const tsMs = Number(BigInt(tsNs) / 1_000_000n);
          logs.push({
            timestamp: new Date(tsMs).toISOString(),
            level: String(parsed.level ?? 'info'),
            message: String(parsed.message ?? ''),
            logType: String(parsed.logType ?? 'service'),
            context: parsed.context ? String(parsed.context) : undefined,
            sequence: Number(parsed.sequence ?? 0),
            duration: parsed.duration !== undefined ? Number(parsed.duration) : undefined,
            query: parsed.query ? String(parsed.query) : undefined,
            statusCode: parsed.statusCode !== undefined ? Number(parsed.statusCode) : undefined,
            event: parsed.event ? String(parsed.event) : undefined,
            spanId: String(parsed.spanId ?? ''),
            parentSpanId: parsed.parentSpanId ? String(parsed.parentSpanId) : undefined,
            service: String(parsed.service ?? stream.stream.app ?? ''),
            path: String(parsed.path ?? ''),
            method: String(parsed.method ?? ''),
            userId: parsed.userId ? String(parsed.userId) : undefined,
          });
        } catch {
          // Skip malformed lines
        }
      }
    }

    return logs.sort((a, b) => {
      const tDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return tDiff !== 0 ? tDiff : (a.sequence as number) - (b.sequence as number);
    });
  }

  // ─── Span tree builder ───────────────────────────────────────────

  private buildTraceResult(traceId: string, logs: SpanLog[]): TraceResult {
    // Group logs by spanId
    const spanMap = new Map<string, SpanLog[]>();
    for (const log of logs) {
      const sid = String(log.spanId ?? '');
      if (!sid) continue;
      if (!spanMap.has(sid)) spanMap.set(sid, []);
      spanMap.get(sid)!.push(log);
    }

    const spans: Span[] = [];
    const services = new Set<string>();

    for (const [spanId, spanLogs] of spanMap.entries()) {
      const httpIn = spanLogs.find((l) => l.logType === 'http_in');
      const httpRes = spanLogs.find((l) => l.logType === 'http_in_res');
      const first = spanLogs[0];

      services.add(String(first.service ?? ''));

      spans.push({
        spanId,
        parentSpanId: first.parentSpanId ? String(first.parentSpanId) : undefined,
        service: String(first.service ?? ''),
        method: String(httpIn?.method ?? first.method ?? ''),
        path: String(httpIn?.path ?? first.path ?? ''),
        startTime: first.timestamp,
        endTime: httpRes ? httpRes.timestamp : undefined,
        durationMs: httpRes?.duration !== undefined ? Number(httpRes.duration) : undefined,
        statusCode: httpRes?.statusCode !== undefined ? Number(httpRes.statusCode) : undefined,
        userId: first.userId ? String(first.userId) : undefined,
        logs: spanLogs.sort((a, b) => (a.sequence as number) - (b.sequence as number)),
      });
    }

    // Build tree: find which spans are children of which
    const spanById = new Map(spans.map((s) => [s.spanId, s]));
    const rootSpans: Span[] = [];

    for (const span of spans) {
      if (span.parentSpanId && spanById.has(span.parentSpanId)) {
        const parent = spanById.get(span.parentSpanId)!;
        parent.children = parent.children ?? [];
        parent.children.push(span);
      } else {
        rootSpans.push(span);
      }
    }

    const allTimes = spans.map((s) => new Date(s.startTime).getTime());
    const traceStart = Math.min(...allTimes);
    const traceEnd = Math.max(
      ...spans.map((s) =>
        s.endTime
          ? new Date(s.endTime).getTime()
          : new Date(s.startTime).getTime() + (s.durationMs ?? 0),
      ),
    );

    return {
      traceId,
      startTime: new Date(traceStart).toISOString(),
      durationMs: traceEnd - traceStart,
      services: [...services],
      spans,
      rootSpans,
    };
  }
}
