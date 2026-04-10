import { Injectable, Inject, LoggerService, OnModuleDestroy } from '@nestjs/common';
import * as winston from 'winston';
import * as http from 'http';
import * as https from 'https';
import { LokiLoggerOptions, LOKI_LOGGER_OPTIONS, LogType } from '../interfaces';
import { traceStorage, nextSequence } from './trace-context';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const TransportStream = require('winston-transport') as new (opts?: object) => winston.transport;

class MinimalLokiTransport extends TransportStream {
  private readonly lokiUrl: URL;
  private readonly labels: Record<string, string>;
  private readonly maxRetries: number;
  private readonly maxBufferSize: number;
  private readonly bufferWhenUnreachable: boolean;
  private readonly apiKey: string | undefined;
  private buffer: Array<[string, string]> = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(opts: {
    host: string;
    labels: Record<string, string>;
    intervalMs?: number;
    maxRetries?: number;
    maxBufferSize?: number;
    bufferWhenUnreachable?: boolean;
    apiKey?: string;
  }) {
    super();
    this.lokiUrl = new URL('/loki/api/v1/push', opts.host);
    this.labels = opts.labels;
    this.maxRetries = opts.maxRetries ?? 3;
    this.maxBufferSize = opts.maxBufferSize ?? 5000;
    this.bufferWhenUnreachable = opts.bufferWhenUnreachable ?? false;
    this.apiKey = opts.apiKey;

    const intervalMs = opts.intervalMs ?? 5000;
    this.flushTimer = setInterval(() => this.flush(), intervalMs);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    // Loki expects nanosecond-precision timestamps as strings
    const ts = String(Date.now() * 1_000_000);
    this.buffer.push([ts, JSON.stringify(info)]);
    // Drop the oldest entry when the cap is reached to protect memory
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
    callback();
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const values = [...this.buffer];
    this.buffer = [];

    const body = JSON.stringify({
      streams: [{ stream: this.labels, values }],
    });

    this.sendWithRetry(body, values, this.maxRetries);
  }

  /**
   * Attempts to push `body` to Loki. On failure (network error, non-2xx, or
   * timeout) waits `200ms * 2^attempt` before retrying up to `retriesLeft`
   * times. On final failure, puts the batch back in the buffer so it is
   * included in the next scheduled flush.
   */
  private sendWithRetry(
    body: string,
    values: Array<[string, string]>,
    retriesLeft: number,
    attempt = 0,
  ): void {
    const isHttps = this.lokiUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const retry = () => {
      if (retriesLeft <= 0) {
        // All retries exhausted — re-queue only if the user opted in to buffering.
        // With bufferWhenUnreachable: false (default), the batch is simply dropped.
        if (this.bufferWhenUnreachable) {
          const available = Math.max(0, this.maxBufferSize - this.buffer.length);
          const requeue = values.slice(0, available);
          this.buffer = [...requeue, ...this.buffer];
        }
        return;
      }
      const delayMs = 200 * Math.pow(2, attempt);
      const timer = setTimeout(
        () => this.sendWithRetry(body, values, retriesLeft - 1, attempt + 1),
        delayMs,
      );
      if (timer.unref) timer.unref();
    };

    try {
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      };
      if (this.apiKey) headers['X-Scope-OrgID'] = this.apiKey;

      const req = lib.request(
        {
          hostname: this.lokiUrl.hostname,
          port: this.lokiUrl.port || (isHttps ? 443 : 80),
          path: this.lokiUrl.pathname,
          method: 'POST',
          headers,
          timeout: 5000,
        },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode >= 500) retry();
        },
      );
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
      req.write(body);
      req.end();
    } catch {
      retry();
    }
  }

  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

@Injectable()
export class LokiLoggerService implements LoggerService, OnModuleDestroy {
  private readonly logger: winston.Logger;
  readonly resolvedOptions: Required<Omit<LokiLoggerOptions, 'apiKey'>> & { apiKey: string | undefined };

  constructor(@Inject(LOKI_LOGGER_OPTIONS) options: LokiLoggerOptions) {
    this.resolvedOptions = {
      environment: process.env.NODE_ENV ?? 'development',
      extraLabels: {},
      traceHeader: 'x-loki-trace-id',
      parentSpanHeader: 'x-parent-span-id',
      logLevel: 'info',
      consoleOutput: false,
      jsonConsole: false,
      lokiBatchInterval: 5000,
      lokiRetries: 3,
      lokiBufferSize: 5000,
      bufferLogsWhenUnreachable: false,
      logRequestBody: false,
      logResponseBody: false,
      redactFields: [],
      enableTraceViewer: false,
      traceViewerPath: '/_trace',
      traceViewerServices: options.serviceName,
      enableMetrics: false,
      metricsPath: '/metrics',
      enableTracing: false,
      otlpEndpoint: 'http://localhost:4318',
      apiKey: undefined,
      ...options,
    } as Required<Omit<LokiLoggerOptions, 'apiKey'>> & { apiKey: string | undefined };

    const opts = this.resolvedOptions;
    const transports: winston.transport[] = [];

    // Console is optional: Loki uses its own transport. Same log events go to all transports.
    if (opts.consoleOutput) {
      transports.push(
        new winston.transports.Console({
          format: opts.jsonConsole
            ? winston.format.combine(winston.format.timestamp(), winston.format.json())
            : winston.format.combine(
              winston.format.colorize({ all: true }),
              winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
              winston.format.printf(
                ({
                  timestamp,
                  level,
                  message,
                  traceId,
                  spanId,
                  context,
                  duration,
                  sequence,
                  ...rest
                }) => {
                  const parts: string[] = [`${timestamp} ${level}`];
                  if (context) parts.push(`[${String(context)}]`);
                  if (traceId) parts.push(`[T:${String(traceId).slice(0, 8)}]`);
                  if (spanId) parts.push(`[S:${String(spanId).slice(0, 8)}]`);
                  if (sequence !== undefined) parts.push(`#${String(sequence)}`);
                  parts.push(String(message));
                  if (duration !== undefined) parts.push(`+${String(duration)}ms`);
                  const extra = Object.entries(rest).filter(
                    ([k]) => !['service', 'path', 'method', 'userId', 'parentSpanId'].includes(k),
                  );
                  if (extra.length) parts.push(JSON.stringify(Object.fromEntries(extra)));
                  return parts.join(' ');
                },
              ),
            ),
        }),
      );
    }

    transports.push(
      new MinimalLokiTransport({
        host: opts.lokiHost,
        labels: {
          app: opts.serviceName,
          env: opts.environment,
          ...opts.extraLabels,
        },
        intervalMs: opts.lokiBatchInterval,
        maxRetries: opts.lokiRetries,
        maxBufferSize: opts.lokiBufferSize,
        bufferWhenUnreachable: opts.bufferLogsWhenUnreachable,
        apiKey: opts.apiKey,
      }),
    );

    const redactFieldsSet = new Set(opts.redactFields);

    this.logger = winston.createLogger({
      level: opts.logLevel,
      format: redactFieldsSet.size > 0
        ? winston.format((info) =>
          this.redactObject(info, redactFieldsSet) as winston.Logform.TransformableInfo,
        )()
        : undefined,
      transports,
    });

    if (opts.environment === 'production' || opts.environment === 'prod' && (opts.logRequestBody || opts.logResponseBody)) {
      this.logger.warn(
        'logRequestBody/logResponseBody is enabled in production — sensitive data may be shipped to Loki',
        { context: 'LokiLoggerService', logType: 'service' },
      );
    }

    // Non-blocking connectivity probe — warns if Loki is unreachable at startup
    setImmediate(() => this.probeLoki());
  }

  // ─── Public API ──────────────────────────────────────────────────

  log(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, this.buildMeta(context, 'service', meta));
  }

  error(message: string, trace?: string, context?: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, this.buildMeta(context, 'service', { trace, ...meta }));
  }

  warn(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, this.buildMeta(context, 'service', meta));
  }

  debug(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, this.buildMeta(context, 'service', meta));
  }

  verbose(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.logger.verbose(message, this.buildMeta(context, 'service', meta));
  }

  event(eventName: string, meta?: Record<string, unknown>): void {
    this.logger.info(eventName, this.buildMeta('Event', 'event', { event: eventName, ...meta }));
  }

  /**
   * Log an outgoing HTTP call start, and return a callback to log the result.
   * logType is set to 'http_out' for both to make them filterable in the viewer.
   */
  httpCall(
    method: string,
    url: string,
    meta?: Record<string, unknown>,
  ): (statusCode?: number) => void {
    const start = Date.now();
    this.logger.debug(`→ ${method} ${url}`, this.buildMeta('HttpClient', 'http_out', meta));
    return (statusCode?: number) => {
      const duration = Date.now() - start;
      this.logger.info(
        `← ${method} ${url}`,
        this.buildMeta('HttpClient', 'http_out', { duration, statusCode, ...meta }),
      );
    };
  }

  /**
   * Internal method used by middleware and interceptors to log with
   * a specific logType without going through the public API.
   */
  logWithType(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    logType: LogType,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger[level](message, this.buildMeta(context, logType, meta));
  }

  onModuleDestroy(): void {
    this.logger.end();
  }

  // ─── Private ─────────────────────────────────────────────────────

  private buildMeta(
    context?: string,
    logType: LogType = 'service',
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    const store = traceStorage.getStore();
    const sequence = nextSequence();
    return {
      ...(store && {
        traceId: store.traceId,
        spanId: store.spanId,
        ...(store.parentSpanId && { parentSpanId: store.parentSpanId }),
        service: store.service,
        path: store.requestPath,
        method: store.method,
        ...(store.ip && { ip: store.ip }),
        ...(store.userId && { userId: store.userId }),
        sequence,
        // Spread custom tags (static from @Log decorator + dynamic from addTraceTag())
        // so every label is queryable as a top-level field in Loki/LogQL.
        ...(store.tags && store.tags),
      }),
      logType,
      ...(context && { context }),
      ...(extra && this.filterUndefined(extra)),
    };
  }

  private probeLoki(): void {
    const lokiHost = this.resolvedOptions.lokiHost;
    try {
      const url = new URL('/ready', lokiHost);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: '/ready',
          method: 'GET',
          timeout: 3000,
        },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode >= 400) {
            this.logger.warn(
              `Loki not reachable at ${lokiHost} (HTTP ${res.statusCode}) — logs will ${this.resolvedOptions.bufferLogsWhenUnreachable ? 'buffer' : 'be dropped'} until Loki is available`,
              { context: 'LokiLoggerService', logType: 'service' },
            );
          }
        },
      );
      req.on('error', () => {
        this.logger.warn(
          `Loki not reachable at ${lokiHost} — logs will ${this.resolvedOptions.bufferLogsWhenUnreachable ? 'buffer' : 'be dropped'} until Loki is available`,
          { context: 'LokiLoggerService', logType: 'service' },
        );
      });
      req.on('timeout', () => {
        req.destroy();
      });
      req.end();
    } catch {
      this.logger.warn(
        `Invalid lokiHost "${lokiHost}" — could not probe Loki connectivity`,
        { context: 'LokiLoggerService', logType: 'service' },
      );
    }
  }

  /**
   * Recursively walks `obj` and replaces the value of any key present in
   * `fields` with `'[REDACTED]'`. Arrays are traversed element-by-element.
   * Primitives are returned as-is. Uses a Set for O(1) key lookups.
   */
  private redactObject(obj: unknown, fields: Set<string>): unknown {
    if (Array.isArray(obj)) {
      return obj.map((el) => this.redactObject(el, fields));
    }
    if (obj !== null && typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out[k] = fields.has(k) ? '[REDACTED]' : this.redactObject(v, fields);
      }
      return out;
    }
    return obj;
  }

  private filterUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
  }
}
