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
import { v4 as uuidv4 } from 'uuid';
import { VIEWER_HTML } from './viewer/viewer.html';
import { setLoggerRef } from './core/logger-ref';
import { LokiLoggerOptions, LokiLoggerAsyncOptions, LOKI_LOGGER_OPTIONS } from './interfaces';
import { LokiLoggerService } from './core/loki-logger.service';
import { TraceViewerService } from './viewer/trace-viewer.service';
import { traceStorage } from './core/trace-context';

type Req = import('express').Request;
type Res = import('express').Response;
type NextFn = import('express').NextFunction;

const CORE_PROVIDERS: Provider[] = [LokiLoggerService, TraceViewerService];
const CORE_EXPORTS = [LOKI_LOGGER_OPTIONS, LokiLoggerService, TraceViewerService];

@Module({})
export class LokiLoggerModule {
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
   * Wire everything in one call. Call after NestFactory.create(), before app.listen().
   *
   * What it sets up:
   *  1. LokiLoggerService as the global NestJS logger (framework logs go through it)
   *  2. Trace middleware on every request — creates traceId + spanId, wraps the
   *     entire call stack in AsyncLocalStorage so all logs within a request share
   *     the same trace context without any manual wiring
   *  3. Global interceptor — logs handler entry, exit, duration, and errors with
   *     full stack traces, all tagged with traceId + spanId + sequence number
   *
   * traceId is returned on every response (success AND error) in the x-trace-id
   * response header. Clients use this to correlate logs when reporting issues.
   *
   * @example
   * // main.ts
   * const app = await NestFactory.create(AppModule);
   * LokiLoggerModule.apply(app);
   * LokiLoggerModule.mountViewer(app);  // optional — call before listen()
   * await app.listen(3000);
   */
  static apply(app: any): void {
    const logger = app.get(LokiLoggerService) as LokiLoggerService;
    const options = app.get(LOKI_LOGGER_OPTIONS) as LokiLoggerOptions;

    // 1. Set module-level singleton so @Log() and getLogger() work everywhere
    //    without constructor injection.
    setLoggerRef(logger);
    app.useLogger(logger);

    // 2. Trace middleware — runs before every request handler.
    //    Reads or creates a traceId, creates a fresh spanId for this hop,
    //    echoes both back as response headers, then wraps the entire async
    //    call stack in AsyncLocalStorage so every log/DB/HTTP call in this
    //    request automatically carries the trace context.
    const traceHeader = options.traceHeader ?? 'x-loki-trace-id';
    const parentSpanHeader = options.parentSpanHeader ?? 'x-parent-span-id';

    app.use((req: Req, res: Res, next: NextFn) => {
      const traceId = (req.headers[traceHeader] as string | undefined) ?? uuidv4();
      const spanId = uuidv4();
      const parentSpanId = req.headers[parentSpanHeader] as string | undefined;
      const startTime = Date.now();

      // Echo trace headers so the caller can correlate their own logs,
      // and downstream services receive the same traceId.
      res.setHeader(traceHeader, traceId);
      res.setHeader(parentSpanHeader, spanId);

      const fwd = req.headers['x-forwarded-for'];
      const ip = fwd
        ? Array.isArray(fwd)
          ? fwd[0]
          : fwd.split(',')[0].trim()
        : (req.socket?.remoteAddress ?? 'unknown');

      traceStorage.run(
        {
          traceId,
          spanId,
          parentSpanId,
          service: options.serviceName,
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
          if (options.logRequestBody && (req as any).body) inMeta.body = (req as any).body;

          logger.logWithType('info', `→ ${req.method} ${req.path}`, 'http_in', 'HTTP', inMeta);

          res.on('finish', () => {
            const duration = Date.now() - startTime;
            const status = res.statusCode;
            const msg = `← ${req.method} ${req.path} ${status} +${duration}ms`;
            const outMeta = { statusCode: status, duration };
            if (status >= 500) logger.logWithType('error', msg, 'http_in_res', 'HTTP', outMeta);
            else if (status >= 400) logger.logWithType('warn', msg, 'http_in_res', 'HTTP', outMeta);
            else logger.logWithType('info', msg, 'http_in_res', 'HTTP', outMeta);
          });

          next();
        },
      );
    });

    // 3. Global interceptor — plain object, no @Injectable(), safe under pnpm isolation.
    //    Logs handler entry/exit and catches + logs any unhandled errors with stack trace.
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
              { traceId: trace?.traceId, spanId: trace?.spanId, duration, stack: err?.stack },
            );
            return throwError(() => err);
          }),
        );
      },
    };
    app.useGlobalInterceptors(interceptor);
  }

  // ── mountViewer() ────────────────────────────────────────────────

  /**
   * Mount the trace viewer SPA and REST API on raw Express routes.
   * Must be called BEFORE app.listen() — NestJS adds its 404 handler
   * during listen() which would shadow anything registered after.
   *
   * Only runs if enableTraceViewer: true in options. Safe to call unconditionally.
   *
   * Routes mounted:
   *   GET /{traceViewerPath}           → Trace viewer SPA
   *   GET /{traceViewerPath}/api/:id   → JSON span data for a traceId
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
