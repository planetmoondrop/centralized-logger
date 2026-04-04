/**
 * OpenTelemetry initialisation — this file MUST be imported first in main.ts.
 * It installs require-hooks so that http, express, and other modules are
 * automatically instrumented before NestJS loads them.
 */
import { initObservability } from '@moondrop/centralized-logger';

initObservability({
  serviceName: 'backend',
  otlpEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://tempo:4318',
  environment: process.env['NODE_ENV'] ?? 'development',
});
