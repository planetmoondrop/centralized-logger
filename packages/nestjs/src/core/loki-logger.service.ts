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
  private buffer: Array<[string, string]> = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(opts: {
    host: string;
    labels: Record<string, string>;
    intervalMs?: number;
    maxRetries?: number;
  }) {
    super();
    this.lokiUrl = new URL('/loki/api/v1/push', opts.host);
    this.labels = opts.labels;
    this.maxRetries = opts.maxRetries ?? 3;

    const intervalMs = opts.intervalMs ?? 5000;
    this.flushTimer = setInterval(() => this.flush(), intervalMs);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    // Loki expects nanosecond-precision timestamps as strings
    const ts = String(Date.now() * 1_000_000);
    this.buffer.push([ts, JSON.stringify(info)]);
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
        // Re-queue the batch to be picked up on the next flush cycle.
        // Prepend so ordering is preserved relative to newer entries.
        this.buffer = [...values, ...this.buffer];
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
      const req = lib.request(
        {
          hostname: this.lokiUrl.hostname,
          port: this.lokiUrl.port || (isHttps ? 443 : 80),
          path: this.lokiUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 5000,
        },
        (res) => {
          res.resume();
          // Loki returns 204 on success; retry on any server error.
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
  readonly resolvedOptions: Required<LokiLoggerOptions>;

  constructor(@Inject(LOKI_LOGGER_OPTIONS) options: LokiLoggerOptions) {
    this.resolvedOptions = {
      environment: process.env.NODE_ENV ?? 'development',
      extraLabels: {},
      traceHeader: 'x-loki-trace-id',
      parentSpanHeader: 'x-parent-span-id',
      logLevel: 'info',
      consoleOutput: true,
      jsonConsole: false,
      lokiBatchInterval: 5000,
      lokiRetries: 3,
      logRequestBody: false,
      enableTraceViewer: false,
      traceViewerPath: '/_trace',
      traceViewerServices: options.serviceName,
      ...options,
    };

    const opts = this.resolvedOptions;
    const transports: winston.transport[] = [];

    if (opts.consoleOutput || opts.environment === 'development') {
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
      }),
    );

    this.logger = winston.createLogger({
      level: opts.logLevel,
      transports,
    });
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
        ...(store.userId && { userId: store.userId }),
        sequence,
      }),
      logType,
      ...(context && { context }),
      ...(extra && this.filterUndefined(extra)),
    };
  }

  private filterUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
  }
}
