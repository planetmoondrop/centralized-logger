import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { traceStorage } from '../core/trace-context';
import { LokiLoggerOptions, LOKI_LOGGER_OPTIONS } from '../interfaces';
import { LokiLoggerService } from '../core/loki-logger.service';

/**
 * LokiTraceMiddleware
 *
 * The single piece of glue between HTTP and the tracing system.
 * Runs on every request before any controller or guard.
 *
 * What it does:
 *  1. Reads (or creates) a traceId from the configured header.
 *  2. Reads an optional parentSpanId from upstream services.
 *  3. Creates a fresh spanId for this specific request.
 *  4. Echoes traceId + spanId back on response headers.
 *  5. Wraps the entire call-stack in AsyncLocalStorage.run() so every
 *     log, query, and outgoing HTTP call carries the same trace context.
 *  6. Logs the incoming request (logType: http_in) and the outgoing
 *     response (logType: http_in_res) with status + duration.
 *
 * Auto-applied to all routes by LokiLoggerModule.configure().
 */
@Injectable()
export class LokiTraceMiddleware implements NestMiddleware {
  constructor(
    @Inject(LOKI_LOGGER_OPTIONS) private readonly options: LokiLoggerOptions,
    private readonly logger: LokiLoggerService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const traceHeader = this.options.traceHeader ?? 'x-trace-id';
    const parentSpanHeader = this.options.parentSpanHeader ?? 'x-parent-span-id';

    // Propagate or create traceId — this is the cross-service thread
    const traceId = (req.headers[traceHeader] as string | undefined) ?? uuidv4();
    // Each service hop gets its own spanId
    const spanId = uuidv4();
    // Who called us? (set by LokiHttpService on outgoing calls)
    const parentSpanId = req.headers[parentSpanHeader] as string | undefined;

    // Echo headers so downstream callers can propagate the same trace
    res.setHeader(traceHeader, traceId);
    res.setHeader('x-span-id', spanId);

    const startTime = Date.now();

    traceStorage.run(
      {
        traceId,
        spanId,
        parentSpanId,
        service: this.options.serviceName,
        requestPath: req.path,
        method: req.method,
        startTime,
        ip: this.extractIp(req),
        userId: (req as Request & { user?: { id: string } }).user?.id,
        userAgent: req.headers['user-agent'],
        sequence: 0, // Will be incremented on first log via nextSequence()
      },
      () => {
        // ── Incoming request log ──────────────────────────────────
        const incomingMeta: Record<string, unknown> = {
          userAgent: req.headers['user-agent'],
          ip: this.extractIp(req),
        };
        if (Object.keys(req.query).length) incomingMeta.query = req.query;
        if (this.options.logRequestBody && req.body) incomingMeta.body = req.body;

        this.logger.logWithType(
          'info',
          `→ ${req.method} ${req.path}`,
          'http_in',
          'HTTP',
          incomingMeta,
        );

        // ── Outgoing response log (fires when NestJS sends headers) ──
        res.on('finish', () => {
          const duration = Date.now() - startTime;
          const status = res.statusCode;

          const outgoingMeta: Record<string, unknown> = { statusCode: status, duration };

          if (status >= 500) {
            this.logger.logWithType(
              'error',
              `← ${req.method} ${req.path} ${status} +${duration}ms`,
              'http_in_res',
              'HTTP',
              outgoingMeta,
            );
          } else if (status >= 400) {
            this.logger.logWithType(
              'warn',
              `← ${req.method} ${req.path} ${status} +${duration}ms`,
              'http_in_res',
              'HTTP',
              outgoingMeta,
            );
          } else {
            this.logger.logWithType(
              'info',
              `← ${req.method} ${req.path} ${status} +${duration}ms`,
              'http_in_res',
              'HTTP',
              outgoingMeta,
            );
          }
        });

        next();
      },
    );
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? 'unknown';
  }
}
