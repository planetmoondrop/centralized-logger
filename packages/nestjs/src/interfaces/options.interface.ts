/**
 * Configuration options for LokiLoggerModule.
 */
export interface LokiLoggerOptions {
  /**
   * Unique name for this microservice.
   * Used as the `app` label in every Loki log line and as the `app` label
   * in Prometheus metrics.
   * @example 'auth-service'
   */
  serviceName: string;

  /**
   * Full URL of your Grafana Loki instance.
   * @example 'http://loki:3100'
   */
  lokiHost: string;

  /**
   * Deployment environment. Added as the `env` label in Loki.
   * @default process.env.NODE_ENV ?? 'development'
   */
  environment?: string;

  /**
   * Additional static labels attached to every log line pushed to Loki.
   * @example { region: 'us-east-1', team: 'platform' }
   */
  extraLabels?: Record<string, string>;

  /**
   * HTTP header name used to propagate trace IDs between services.
   * @default 'x-loki-trace-id'
   */
  traceHeader?: string;

  /**
   * HTTP header name used to propagate span IDs between services.
   * Enables parent → child span hierarchy in the trace viewer.
   * @default 'x-parent-span-id'
   */
  parentSpanHeader?: string;

  /**
   * Minimum log level forwarded to Loki.
   * @default 'info'
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Whether to also print logs to stdout.
   * Always true in 'development' environment regardless of this setting.
   * @default true
   */
  consoleOutput?: boolean;

  /**
   * Whether to use structured JSON in console output.
   * When false, uses a human-readable colourised format.
   * @default false
   */
  jsonConsole?: boolean;

  /**
   * How often (ms) buffered logs are pushed to Loki.
   * @default 5000
   */
  lokiBatchInterval?: number;

  /**
   * Number of times to retry a failed Loki push before dropping logs.
   * @default 3
   */
  lokiRetries?: number;

  /**
   * Maximum number of log entries held in the in-memory Loki push buffer.
   * When the limit is reached the oldest entries are dropped to protect memory.
   * Increase for high-throughput services or sustained Loki outages.
   * At ~500 bytes per entry the default uses at most ~2.5 MB of memory.
   * @default 5000
   */
  lokiBufferSize?: number;

  /**
   * When true, logs the incoming request body.
   * Warning: may log sensitive data. Never enable in production.
   * @default false
   */
  logRequestBody?: boolean;

  /**
   * When true, logs the outgoing response body (truncated to 2 KB).
   * Warning: may log sensitive data. Enable only for debugging.
   * @default false
   */
  logResponseBody?: boolean;

  /**
   * List of object key names to redact from all log output.
   * Any key matching an entry (at any depth in the logged object) will have
   * its value replaced with '[REDACTED]' before reaching any transport.
   * Matching is case-sensitive. Default is empty — no redaction applied.
   * @default []
   * @example ['password', 'token', 'authorization', 'secret', 'apiKey']
   */
  redactFields?: string[];

  /**
   * Enable the built-in trace viewer UI and REST API.
   *
   * When true, two endpoints are registered:
   *   GET  {traceViewerPath}/              → serves the trace viewer SPA
   *   GET  {traceViewerPath}/api/:traceId  → returns structured span JSON
   *
   * @default false
   */
  enableTraceViewer?: boolean;

  /**
   * Mount path for the built-in trace viewer.
   * @default '/_trace'
   */
  traceViewerPath?: string;

  /**
   * Comma-separated service names to include in cross-service trace queries.
   * Used by the trace viewer to search logs across multiple apps.
   * @example 'auth-service,business-service,gateway'
   */
  traceViewerServices?: string;

  // ── Observability: Prometheus Metrics ────────────────────────────────────

  /**
   * Expose a Prometheus `/metrics` endpoint.
   * Records HTTP request duration, count, in-flight, plus all default
   * Node.js metrics (heap, GC, event loop, CPU, RSS).
   * Powers the "Node System Health" Grafana dashboard.
   * @default false
   */
  enableMetrics?: boolean;

  /**
   * Mount path for the Prometheus metrics endpoint.
   * @default '/metrics'
   */
  metricsPath?: string;

  // ── Observability: OpenTelemetry Tracing ─────────────────────────────────

  /**
   * Enable OpenTelemetry context extraction.
   * When true, the middleware reads the active OTEL span context and uses
   * its traceId/spanId in all Loki log entries.  This makes every Loki log
   * line click-through to the matching Tempo trace waterfall.
   *
   * Requires `@opentelemetry/api` (always bundled) plus an SDK set up by
   * calling `initObservability()` BEFORE NestFactory.create().
   * @default false
   */
  enableTracing?: boolean;

  /**
   * OTLP HTTP endpoint for sending spans to Tempo.
   * Only used by `initObservability()`.
   * @default 'http://localhost:4318'
   */
  otlpEndpoint?: string;

  // ── Observability: API Key / Tenant ──────────────────────────────────────

  /**
   * Optional API key / tenant identifier sent as `X-Scope-OrgID` on every
   * Loki push request.  Use this when Loki is configured with multi-tenancy
   * (`auth_enabled: true`) or when you want to scope logs per team / project.
   *
   * Generate a key with: `node -e "console.log(require('crypto').randomUUID())"`
   * @example 'team-payments-prod'
   */
  apiKey?: string;
}

/**
 * Factory options for async module registration.
 */
export interface LokiLoggerAsyncOptions {
  useFactory: (...args: any[]) => LokiLoggerOptions | Promise<LokiLoggerOptions>;
  inject?: any[];
  imports?: any[];
}
