/**
 * Configuration options for LokiLoggerModule.
 */
export interface LokiLoggerOptions {
  /**
   * Unique name for this microservice.
   * Used as the `app` label in every Loki log line.
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
   * When true, logs the incoming request body.
   * Warning: may log sensitive data. Never enable in production.
   * @default false
   */
  logRequestBody?: boolean;

  /**
   * Enable the built-in trace viewer UI and REST API.
   *
   * When true, two endpoints are registered:
   *   GET  {traceViewerPath}/              → serves the trace viewer SPA
   *   GET  {traceViewerPath}/api/:traceId  → returns structured span JSON
   *
   * The viewer queries Loki directly using lokiHost so no additional
   * infrastructure is needed.
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
}

/**
 * Factory options for async module registration.
 */
export interface LokiLoggerAsyncOptions {
  useFactory: (...args: any[]) => LokiLoggerOptions | Promise<LokiLoggerOptions>;
  inject?: any[];
  imports?: any[];
}
