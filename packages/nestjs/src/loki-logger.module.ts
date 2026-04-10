import {
  Module,
  DynamicModule,
  Provider,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { randomBytes } from 'crypto';
import { VIEWER_HTML } from './viewer/viewer.html';
import { setLoggerRef } from './core/logger-ref';
import { LokiLoggerOptions, LokiLoggerAsyncOptions, LOKI_LOGGER_OPTIONS } from './interfaces';
import { LokiLoggerService } from './core/loki-logger.service';
import { TraceViewerService } from './viewer/trace-viewer.service';
import { MetricsService } from './metrics/metrics.service';
import { traceStorage } from './core/trace-context';
import { filterUserStackTrace } from './core/stack-trace-filter';
import { getActiveOtelContext } from './otel/init';

type Req = import('express').Request;
type Res = import('express').Response;
type NextFn = import('express').NextFunction;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a 32-char lowercase hex trace ID (OpenTelemetry / Tempo compatible). */
function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** Generate a 16-char lowercase hex span ID (OpenTelemetry / Tempo compatible). */
function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Resolve the effective traceId for this hop.
 *
 * Priority order:
 *  1. Active OpenTelemetry span — ensures Loki logs and Tempo spans share IDs.
 *  2. Incoming x-loki-trace-id request header — continues a cross-service trace.
 *  3. Fresh random hex trace ID — starts a new trace.
 */
function resolveTraceId(incomingHeader: string | undefined, enableTracing: boolean): string {
  if (enableTracing) {
    const { traceId } = getActiveOtelContext();
    if (traceId) return traceId;
  }
  return incomingHeader ?? generateTraceId();
}

/**
 * Resolve the effective spanId for this hop.
 *
 * Priority order:
 *  1. Active OpenTelemetry span.
 *  2. Fresh random hex span ID.
 */
function resolveSpanId(enableTracing: boolean): string {
  if (enableTracing) {
    const { spanId } = getActiveOtelContext();
    if (spanId) return spanId;
  }
  return generateSpanId();
}

// ─── Module ───────────────────────────────────────────────────────────────────

const CORE_PROVIDERS: Provider[] = [LokiLoggerService, TraceViewerService, MetricsService];
const CORE_EXPORTS = [LOKI_LOGGER_OPTIONS, LokiLoggerService, TraceViewerService, MetricsService];

@Module({})
export class LokiLoggerModule {
  private static applied = false;

  // ── Sync registration ────────────────────────────────────────────

  static register(options: LokiLoggerOptions): DynamicModule {
    return {
      global: true,
      module: LokiLoggerModule,
      providers: [{ provide: LOKI_LOGGER_OPTIONS, useValue: options }, ...CORE_PROVIDERS],
      exports: CORE_EXPORTS,
    };
  }

  // ── Async registration (recommended — works with ConfigService) ──

  static registerAsync(asyncOptions: LokiLoggerAsyncOptions): DynamicModule {
    return {
      global: true,
      module: LokiLoggerModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: LOKI_LOGGER_OPTIONS,
          useFactory: asyncOptions.useFactory,
          inject: asyncOptions.inject ?? [],
        },
        ...CORE_PROVIDERS,
      ],
      exports: CORE_EXPORTS,
    };
  }

  // ── apply() ──────────────────────────────────────────────────────

  /**
   * Wire the full observability stack in one call.
   * Call after NestFactory.create(), before app.listen().
   *
   * What it sets up:
   *  1. LokiLoggerService as the global NestJS logger.
   *  2. Trace middleware — creates / continues an OTEL-compatible hex traceId
   *     and spanId, wraps the entire async call stack in AsyncLocalStorage.
   *  3. Global interceptor — logs handler entry, exit, duration, and errors.
   *  4. Prometheus /metrics endpoint (when enableMetrics: true).
   */
  static apply(app: any): void {
    const logger = app.get(LokiLoggerService) as LokiLoggerService;

    if (LokiLoggerModule.applied) {
      logger.warn('LokiLoggerModule.apply() was called more than once — skipping duplicate setup', 'LokiLoggerModule');
      return;
    }
    LokiLoggerModule.applied = true;

    const metrics = app.get(MetricsService) as MetricsService;
    const opts = logger.resolvedOptions;
    const rawOptions = app.get(LOKI_LOGGER_OPTIONS) as LokiLoggerOptions;

    // 1. Global logger
    setLoggerRef(logger);
    app.useLogger(logger);

    const traceHeader = opts.traceHeader;
    const parentSpanHeader = opts.parentSpanHeader;
    const appName = opts.serviceName;
    const env = opts.environment;

    // 2. Trace + metrics middleware
    app.use((req: Req, res: Res, next: NextFn) => {
      const incomingTraceId = req.headers[traceHeader] as string | undefined;
      const traceId = resolveTraceId(incomingTraceId, opts.enableTracing);
      const spanId = resolveSpanId(opts.enableTracing);
      const parentSpanId = req.headers[parentSpanHeader] as string | undefined;
      const startTime = Date.now();

      // Echo trace headers forward so callers and downstream services can correlate
      res.setHeader(traceHeader, traceId);
      res.setHeader(parentSpanHeader, spanId);

      const fwd = req.headers['x-forwarded-for'];
      const ip = fwd
        ? Array.isArray(fwd)
          ? fwd[0]
          : fwd.split(',')[0].trim()
        : (req.socket?.remoteAddress ?? 'unknown');

      // Intercept res.json + res.send to optionally capture the response body.
      // NestJS routes through res.json for object returns and res.send for strings/buffers.
      if (opts.logResponseBody) {
        const captureBody = (raw: unknown): void => {
          if ((res as any).__responseBody) return; // already captured
          try {
            if (typeof raw === 'string') {
              (res as any).__responseBody = raw.substring(0, 2048);
            } else if (raw instanceof Buffer) {
              (res as any).__responseBody = raw.toString('utf8').substring(0, 2048);
            } else if (raw !== undefined && raw !== null) {
              (res as any).__responseBody = JSON.stringify(raw).substring(0, 2048);
            }
          } catch {
            /* ignore serialisation errors */
          }
        };

        const origJson = (res.json as (body: unknown) => Res).bind(res);
        res.json = (body: unknown): Res => {
          captureBody(body);
          return origJson(body);
        };

        const origSend = (res.send as (body?: unknown) => Res).bind(res);
        res.send = (body?: unknown): Res => {
          captureBody(body);
          return origSend(body);
        };
      }

      // In-flight counter
      metrics.incInFlight(appName, env);

      traceStorage.run(
        {
          traceId,
          spanId,
          parentSpanId,
          service: appName,
          requestPath: req.path,
          method: req.method,
          startTime,
          ip,
          userId: (req as any).user?.id,
          userAgent: req.headers['user-agent'],
          sequence: 0,
        },
        () => {
          const inMeta: Record<string, unknown> = { userAgent: req.headers['user-agent'], ip };
          if (Object.keys(req.query).length) inMeta.query = req.query;
          if (opts.logRequestBody && (req as any).body) inMeta.body = (req as any).body;

          logger.logWithType('info', `→ ${req.method} ${req.path}`, 'http_in', 'HTTP', inMeta);

          res.on('finish', () => {
            const duration = Date.now() - startTime;
            const status = res.statusCode;
            const route = req.route?.path ?? req.path;

            // Prometheus metrics
            metrics.recordRequest(req.method, route, status, duration, appName, env);
            metrics.decInFlight(appName, env);

            const outMeta: Record<string, unknown> = { statusCode: status, duration, ip };
            if (opts.logResponseBody && (res as any).__responseBody) {
              outMeta.responseBody = (res as any).__responseBody;
            }

            const msg = `← ${req.method} ${req.path} ${status} +${duration}ms`;
            if (status >= 500) logger.logWithType('error', msg, 'http_in_res', 'HTTP', outMeta);
            else if (status >= 400) logger.logWithType('warn', msg, 'http_in_res', 'HTTP', outMeta);
            else logger.logWithType('info', msg, 'http_in_res', 'HTTP', outMeta);
          });

          next();
        },
      );
    });

    // 3. Global interceptor
    const interceptor: NestInterceptor = {
      intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
        const name = `${ctx.getClass().name}.${ctx.getHandler().name}`;
        const trace = traceStorage.getStore();
        const start = Date.now();

        logger.logWithType('debug', `Enter ${name}`, 'interceptor', 'Interceptor', {
          traceId: trace?.traceId,
          spanId: trace?.spanId,
        });

        return next.handle().pipe(
          tap(() => {
            const duration = Date.now() - start;
            logger.logWithType(
              'debug',
              `Exit  ${name} +${duration}ms`,
              'interceptor',
              'Interceptor',
              { traceId: trace?.traceId, spanId: trace?.spanId, duration },
            );
          }),
          catchError((err: Error) => {
            const duration = Date.now() - start;
            logger.logWithType(
              'error',
              `Error ${name} +${duration}ms — ${err?.message}`,
              'interceptor',
              'Interceptor',
              {
                traceId: trace?.traceId,
                spanId: trace?.spanId,
                duration,
                stack: filterUserStackTrace(err?.stack),
              },
            );
            return throwError(() => err);
          }),
        );
      },
    };
    app.useGlobalInterceptors(interceptor);

    // 4. Prometheus /metrics endpoint
    if (opts.enableMetrics) {
      const rawApp = app.getHttpAdapter().getInstance() as import('express').Application;
      const metricsPath = '/' + (opts.metricsPath ?? 'metrics').replace(/^\//, '');

      rawApp.get(metricsPath, async (_req: Req, res: Res) => {
        try {
          res.set('Content-Type', metrics.getContentType());
          res.end(await metrics.getMetrics());
        } catch (err) {
          res.status(500).end(String(err));
        }
      });

      logger.log(`Prometheus metrics ready → ${metricsPath}`, 'LokiLoggerModule');
    }

    // Log options summary (excluding sensitive fields)
    logger.log(
      `Observability ready — service="${appName}" env="${env}" ` +
        `metrics=${opts.enableMetrics} tracing=${opts.enableTracing} ` +
        `apiKey=${opts.apiKey ? '✓ (set)' : '✗'}`,
      'LokiLoggerModule',
    );

    // Warn when trace viewer is on but traceViewerServices was not explicitly set —
    // the default (current service only) hides cross-service traces in the viewer.
    if (opts.enableTraceViewer && !rawOptions.traceViewerServices) {
      logger.warn(
        `Trace viewer is enabled but traceViewerServices is not set. ` +
          `Only "${appName}" will be queried. ` +
          `Set traceViewerServices: "${appName},other-service" to enable cross-service traces.`,
        'LokiLoggerModule',
      );
    }
  }

  // ── mountViewer() ────────────────────────────────────────────────

  /**
   * Mount the trace viewer SPA and REST API on raw Express routes.
   * Must be called BEFORE app.listen().
   * Only runs if enableTraceViewer: true in options.
   */
  static mountViewer(app: any): void {
    const options = app.get(LOKI_LOGGER_OPTIONS) as LokiLoggerOptions;
    if (!options.enableTraceViewer) return;

    const logger = app.get(LokiLoggerService) as LokiLoggerService;
    const viewerService = app.get(TraceViewerService) as TraceViewerService;
    const rawApp = app.getHttpAdapter().getInstance() as import('express').Application;
    const basePath = '/' + (options.traceViewerPath ?? '_trace').replace(/^\/|\/$/g, '');

    rawApp.get(basePath, (_req: any, res: any) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(VIEWER_HTML);
    });

    rawApp.get(`${basePath}/api/:traceId`, async (req: any, res: any) => {
      try {
        const result = await viewerService.getTrace(req.params.traceId as string);
        if (!result) {
          res.status(404).json({ error: 'Trace not found', traceId: req.params.traceId });
          return;
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({
          error: 'Failed to fetch trace',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    logger.log(`Trace viewer ready → ${basePath}`, 'LokiLoggerModule');
  }
}
