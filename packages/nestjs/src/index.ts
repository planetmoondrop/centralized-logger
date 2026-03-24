// ── Modules ───────────────────────────────────────────────────────
export { LokiLoggerModule } from './loki-logger.module';
export { LokiHttpModule } from './loki-http.module';

// ── Core service ──────────────────────────────────────────────────
export { LokiLoggerService } from './core/loki-logger.service';
export { TypeOrmLokiLogger } from './core/typeorm-loki.logger';
export {
  traceStorage,
  getCurrentTrace,
  getCurrentTraceId,
  getCurrentSpanId,
  nextSequence,
} from './core/trace-context';

// ── Global logger singleton (use without DI) ──────────────────────
// getLogger() returns the LokiLoggerService instance after apply() is called.
// Useful in decorators, utilities, or anywhere you can't inject via constructor.
export { getLogger, setLoggerRef } from './core/logger-ref';

// ── HTTP service ──────────────────────────────────────────────────
export { LokiHttpService } from './utils/loki-http.service';

// ── Middleware / Interceptor (for advanced custom use) ────────────
export { LokiTraceMiddleware } from './middleware/loki-trace.middleware';
export { LokiLoggingInterceptor } from './interceptors/loki-logging.interceptor';

// ── Decorators ────────────────────────────────────────────────────
export { Log, LogDecoratorOptions } from './decorators/log.decorator';
export { InjectLogger } from './decorators/inject-logger.decorator';

// ── Interfaces & tokens ───────────────────────────────────────────
export {
  LokiLoggerOptions,
  LokiLoggerAsyncOptions,
  TraceContext,
  LogType,
  LOKI_LOGGER_OPTIONS,
} from './interfaces';

// ── Trace Viewer ──────────────────────────────────────────────────
export { TraceViewerService } from './viewer/trace-viewer.service';
export type { TraceResult, Span, SpanLog } from './viewer/trace-viewer.service';
