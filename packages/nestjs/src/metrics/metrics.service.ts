import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Histogram,
  Counter,
  Gauge,
} from 'prom-client';
import { LokiLoggerOptions, LOKI_LOGGER_OPTIONS } from '../interfaces';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly registry: Registry;
  readonly httpDuration: Histogram<string>;
  readonly httpRequests: Counter<string>;
  readonly httpInFlight: Gauge<string>;
  readonly enabled: boolean;

  constructor(@Inject(LOKI_LOGGER_OPTIONS) options: LokiLoggerOptions) {
    this.enabled = options.enableMetrics ?? false;

    this.registry = new Registry();

    if (!this.enabled) {
      // Create no-op placeholders so the rest of the code can call them safely
      this.httpDuration = this.buildNoop('histogram') as unknown as Histogram<string>;
      this.httpRequests = this.buildNoop('counter') as unknown as Counter<string>;
      this.httpInFlight = this.buildNoop('gauge') as unknown as Gauge<string>;
      return;
    }

    const app = options.serviceName;
    const env = options.environment ?? process.env.NODE_ENV ?? 'development';

    // Default Node.js metrics: heap, GC, event loop, CPU, RSS, active handles…
    collectDefaultMetrics({
      register: this.registry,
      labels: { app, env },
    });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status_code', 'app', 'env'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'app', 'env'],
      registers: [this.registry],
    });

    this.httpInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently in flight',
      labelNames: ['app', 'env'],
      registers: [this.registry],
    });
  }

  recordRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
    app: string,
    env: string,
  ): void {
    if (!this.enabled) return;
    const labels = { method, route, status_code: String(statusCode), app, env };
    this.httpDuration.observe(labels, durationMs / 1000);
    this.httpRequests.inc(labels);
  }

  incInFlight(app: string, env: string): void {
    if (!this.enabled) return;
    this.httpInFlight.inc({ app, env });
  }

  decInFlight(app: string, env: string): void {
    if (!this.enabled) return;
    this.httpInFlight.dec({ app, env });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  onModuleDestroy(): void {
    this.registry.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildNoop(_type: string): any {
    return {
      observe: () => undefined,
      inc: () => undefined,
      dec: () => undefined,
      set: () => undefined,
    };
  }
}
