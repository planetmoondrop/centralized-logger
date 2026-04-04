# @planetmoondrop/centralized-logger

Centralized Grafana Loki logging for NestJS microservices with automatic distributed tracing, cross-service trace propagation, and zero manual wiring.

## What it does

- Every incoming HTTP request gets a `traceId` + `spanId` stored in `AsyncLocalStorage` — all logs, DB queries, and outgoing HTTP calls made during that request automatically carry the same trace context without passing anything through function arguments.
- Outgoing HTTP calls via `LokiHttpService` inject `x-loki-trace-id` and `x-parent-span-id` so downstream services join the same trace.
- Every log line is shipped to Loki in structured JSON. The built-in trace viewer reconstructs the full cross-service journey from a single trace ID.

## Installation

**Recommended:** from your NestJS project root, run the init wizard. It adds `@planetmoondrop/centralized-logger`, `winston`, and `uuid` when missing, inserts `LokiLoggerModule.register()` into `app.module.ts` when the file looks like a standard Nest `imports: [ … ]` module (skips if `register` / `registerAsync` is already there), optionally installs OpenTelemetry and patches `main.ts` for tracing.

```bash
npx -p @planetmoondrop/centralized-logger planetmoondrop init
```

`npx -p …` only uses that package to run the CLI; the wizard runs `pnpm add` / `npm install` / `yarn add` so the library ends up in **your** `package.json`.

If the package is already a dependency, you can run `npx planetmoondrop init` instead. **`npx planetmoondrop init` by itself (no `-p`) fails with 404** — there is no separate `planetmoondrop` package on npm, only the `planetmoondrop` binary inside `@planetmoondrop/centralized-logger`.

### Manual install

```bash
npm install @planetmoondrop/centralized-logger winston uuid
# or
pnpm add @planetmoondrop/centralized-logger winston uuid
```

Peer dependencies (install separately):

```bash
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Quick start

### 1. Register the module

```ts
// app.module.ts
import { LokiLoggerModule } from '@planetmoondrop/centralized-logger';

@Module({
  imports: [
    LokiLoggerModule.register({
      serviceName: 'auth-service',
      lokiHost:    'http://loki:3100',
      logLevel:    'info',
    }),
  ],
})
export class AppModule {}
```

### 2. Wire it up in main.ts

```ts
// main.ts
import { LokiLoggerModule } from '@planetmoondrop/centralized-logger';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
LokiLoggerModule.apply(app);     // sets up trace middleware + global interceptor
LokiLoggerModule.mountViewer(app); // optional — built-in trace viewer UI
await app.listen(3000);
```

`apply()` does three things:
1. Sets `LokiLoggerService` as the global NestJS logger so framework logs go through it.
2. Registers trace middleware on every request — creates `traceId` + `spanId`, wraps the call stack in `AsyncLocalStorage`.
3. Registers a global interceptor that logs handler entry/exit/error with full stack traces.

### 3. Inject and use the logger

```ts
import { LokiLoggerService } from '@planetmoondrop/centralized-logger';

@Injectable()
export class OrdersService {
  constructor(private readonly logger: LokiLoggerService) {}

  async createOrder(dto: CreateOrderDto) {
    this.logger.log('Creating order', 'OrdersService', { userId: dto.userId });
    // ...
    this.logger.event('order.created', { orderId: order.id, amount: order.total });
  }
}
```

### 4. Decorate methods for automatic entry/exit logging

```ts
import { Log } from '@planetmoondrop/centralized-logger';

@Injectable()
export class PaymentsService {
  @Log({ level: 'info', args: true })
  async charge(userId: string, amount: number) {
    // Entry and exit are logged automatically with duration and traceId
  }
}
```

## Async config (with ConfigService)

```ts
LokiLoggerModule.registerAsync({
  imports: [ConfigModule],
  inject:  [ConfigService],
  useFactory: (config: ConfigService) => ({
    serviceName: config.get('SERVICE_NAME'),
    lokiHost:    config.get('LOKI_HOST'),
    logLevel:    config.get('LOG_LEVEL', 'info'),
  }),
})
```

## Cross-service trace propagation

Import `LokiHttpModule` in any feature module that makes outgoing HTTP calls. It provides `LokiHttpService` — a drop-in for `@nestjs/axios` `HttpService` that automatically injects trace headers:

```ts
// orders.module.ts
import { LokiHttpModule } from '@planetmoondrop/centralized-logger';

@Module({
  imports: [LokiHttpModule],
  providers: [OrdersService],
})
export class OrdersModule {}
```

```ts
// orders.service.ts
import { LokiHttpService } from '@planetmoondrop/centralized-logger';

@Injectable()
export class OrdersService {
  constructor(private readonly http: LokiHttpService) {}

  async validateUser(userId: string) {
    // x-loki-trace-id and x-parent-span-id are injected automatically
    const res = await firstValueFrom(
      this.http.get(`http://auth-service/api/users/${userId}`)
    );
    return res.data;
  }
}
```

## TypeORM integration

```ts
TypeOrmModule.forRootAsync({
  inject: [LokiLoggerService],
  useFactory: (logger: LokiLoggerService) => ({
    ...dbConfig,
    logger: new TypeOrmLokiLogger(logger),
    logging: true,
  }),
})
```

All DB queries, slow queries, and errors are logged to Loki with the traceId of the request that triggered them.

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | required | Loki `app` label for this service |
| `lokiHost` | `string` | required | Loki push URL e.g. `http://loki:3100` |
| `environment` | `string` | `NODE_ENV` | Loki `env` label |
| `logLevel` | `string` | `'info'` | Minimum log level |
| `consoleOutput` | `boolean` | `true` | Print to stdout (always on in development) |
| `jsonConsole` | `boolean` | `false` | JSON vs colourised console format |
| `lokiBatchInterval` | `number` | `5000` | Loki push interval in ms |
| `lokiRetries` | `number` | `3` | Retry attempts on Loki push failure |
| `logRequestBody` | `boolean` | `false` | Log incoming request body (never in production) |
| `traceHeader` | `string` | `'x-loki-trace-id'` | Header used to propagate trace ID |
| `parentSpanHeader` | `string` | `'x-parent-span-id'` | Header used to propagate parent span |
| `enableTraceViewer` | `boolean` | `false` | Mount built-in trace viewer UI |
| `traceViewerPath` | `string` | `'/_trace'` | Mount path for the viewer |
| `traceViewerServices` | `string` | `serviceName` | Comma-separated services to search across |
| `extraLabels` | `object` | `{}` | Additional static Loki labels |

## Exports

```ts
// Modules
LokiLoggerModule, LokiHttpModule

// Services
LokiLoggerService, LokiHttpService, TypeOrmLokiLogger, TraceViewerService

// Decorators
@Log(options?), @InjectLogger()

// Middleware / interceptor (for manual use — not needed with apply())
LokiTraceMiddleware, LokiLoggingInterceptor

// Trace context utilities (callable anywhere, no DI needed)
getCurrentTrace(), getCurrentTraceId(), getCurrentSpanId(), nextSequence()
getLogger()   // returns LokiLoggerService singleton after apply() is called

// Interfaces
LokiLoggerOptions, LokiLoggerAsyncOptions, TraceContext, LogType
```
