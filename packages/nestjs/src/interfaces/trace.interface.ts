/**
 * Per-request trace context stored in AsyncLocalStorage.
 * Available anywhere in the call stack without dependency injection.
 */
export interface TraceContext {
  /**
   * 32-character lowercase hex string that identifies this request across ALL
   * microservices (OpenTelemetry / Tempo compatible format).
   * When initObservability() is called, this equals the active OTEL span's traceId
   * so Loki logs and Tempo spans share the same identifier.
   */
  traceId: string;

  /**
   * 16-character lowercase hex string that identifies THIS specific HTTP span
   * (OpenTelemetry / Tempo compatible).
   * Each service hop creates its own spanId; multiple spans share the same traceId.
   */
  spanId: string;

  /**
   * The spanId of the caller service.
   * Set when a downstream service receives an x-parent-span-id header.
   * Enables building a parent → child span hierarchy in the trace viewer.
   */
  parentSpanId?: string;

  /** Name of the service that received this request. */
  service: string;

  /** Normalized URL path of the request. */
  requestPath: string;

  /** HTTP method (GET, POST, etc.). */
  method: string;

  /** High-resolution request start time in ms. */
  startTime: number;

  /** User ID — populated after authentication middleware sets req.user. */
  userId?: string;

  /** Client IP address. */
  ip?: string;

  /** User agent string. */
  userAgent?: string;

  /**
   * Monotonically incrementing counter per span.
   * Stamped on every log line so the trace viewer can sort logs
   * within a span in the exact order they were emitted.
   */
  sequence: number;

  /**
   * Custom key-value tags added at runtime via addTraceTag().
   * Automatically stamped on every log line for the rest of this request.
   * Scoped to this request only — cleared when the request ends.
   */
  tags?: Record<string, unknown>;
}

/** Classifies the origin of a log entry for filtering in the trace viewer. */
export type LogType =
  | 'http_in' // Incoming HTTP request (middleware start)
  | 'http_in_res' // Outgoing HTTP response (middleware finish)
  | 'http_out' // Outgoing call to another service (LokiHttpService)
  | 'db' // TypeORM / database log
  | 'service' // Manual logger.log/warn/error/debug calls
  | 'event' // logger.event() business events
  | 'interceptor'; // Handler enter/exit (LokiLoggingInterceptor)
