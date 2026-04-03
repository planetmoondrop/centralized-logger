/**
 * Call this function at the very top of your main.ts — BEFORE NestFactory.create().
 * It initialises the OpenTelemetry Node SDK, wires an OTLP exporter to Tempo,
 * and auto-instruments HTTP, Express, and optionally TypeORM.
 *
 * @example
 * // main.ts  ← must be the first imports
 * import { initObservability } from 'moondrop-centralized-logger';
 * initObservability({ serviceName: 'auth-service', otlpEndpoint: 'http://tempo:4318' });
 *
 * // … rest of NestJS bootstrap
 */
export interface ObservabilityOptions {
  /** Must match the serviceName used in LokiLoggerModule.register(). */
  serviceName: string;
  /** OTLP HTTP endpoint of your Tempo instance.  @default 'http://localhost:4318' */
  otlpEndpoint?: string;
  /** Deployment environment label attached to every span.  @default process.env.NODE_ENV */
  environment?: string;
}

export function initObservability(options: ObservabilityOptions): void {
  const endpoint = options.otlpEndpoint ?? 'http://localhost:4318';
  const env = options.environment ?? process.env.NODE_ENV ?? 'development';

  try {
    // Dynamic requires keep the SDK packages as optional peer dependencies.
    // If any package is missing we log a clear warning and skip tracing setup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK } = require('@opentelemetry/sdk-node') as { NodeSDK: any };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as {
      OTLPTraceExporter: any;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node') as {
      getNodeAutoInstrumentations: any;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require('@opentelemetry/resources') as { Resource: any };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const semanticConventions = require('@opentelemetry/semantic-conventions') as Record<string, unknown>;

    // Support both old (SEMRESATTRS_*) and new (ATTR_SERVICE_NAME) naming conventions
    const SERVICE_NAME =
      (semanticConventions['SEMRESATTRS_SERVICE_NAME'] as string) ??
      (semanticConventions['ATTR_SERVICE_NAME'] as string) ??
      'service.name';
    const DEPLOYMENT_ENV =
      (semanticConventions['SEMRESATTRS_DEPLOYMENT_ENVIRONMENT'] as string) ??
      (semanticConventions['ATTR_DEPLOYMENT_ENVIRONMENT'] as string) ??
      'deployment.environment';

    const traceExporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    });

    const sdk = new NodeSDK({
      resource: new Resource({
        [SERVICE_NAME]: options.serviceName,
        [DEPLOYMENT_ENV]: env,
      }),
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Keep noise low — disable filesystem instrumentation
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-pg': { enabled: true },
          '@opentelemetry/instrumentation-mysql2': { enabled: true },
          '@opentelemetry/instrumentation-mongodb': { enabled: true },
          '@opentelemetry/instrumentation-redis': { enabled: true },
          '@opentelemetry/instrumentation-ioredis': { enabled: true },
        }),
      ],
    });

    sdk.start();

    // Graceful shutdown — flush any pending spans before the process exits
    const shutdown = () =>
      sdk
        .shutdown()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));

    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);

    console.log(
      `[Moondrop Observability] OpenTelemetry SDK started — exporting traces to ${endpoint}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Moondrop Observability] OpenTelemetry packages not found (${msg}). ` +
        `Install @opentelemetry/sdk-node, @opentelemetry/exporter-trace-otlp-http, ` +
        `@opentelemetry/auto-instrumentations-node, @opentelemetry/resources, ` +
        `and @opentelemetry/semantic-conventions to enable distributed tracing.`,
    );
  }
}

/**
 * Read the active OpenTelemetry span context (if an SDK is running).
 * Returns undefined fields when OTEL is not initialised or there is no
 * active span — the caller then falls back to generating its own hex IDs.
 */
export function getActiveOtelContext(): { traceId?: string; spanId?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { trace } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
    const span = trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      // A valid OTEL span has a non-zero 32-char hex traceId
      if (ctx.traceId && ctx.traceId !== '0'.repeat(32)) {
        return { traceId: ctx.traceId, spanId: ctx.spanId };
      }
    }
  } catch {
    // @opentelemetry/api not installed — silently skip
  }
  return {};
}
