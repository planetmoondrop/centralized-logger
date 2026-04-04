# centralized-logger

Monorepo for `@moondrop/centralized-logger` — centralized Grafana Loki logging
for NestJS microservices with automatic distributed tracing.

## Packages

| Package                                | Description                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`packages/nestjs`](./packages/nestjs) | NestJS module — logger service, trace middleware, interceptor, TypeORM adapter, trace viewer      |
| [`packages/client`](./packages/client) | Frontend Axios interceptor — propagates `x-loki-trace-id` from responses into subsequent requests |

## Examples

See [`examples/`](./examples) for a fully working demo:
three NestJS services + a Vite frontend, all wired together with one command:

```bash
cd examples && docker compose up --build
```

## Repository layout

```
packages/
  nestjs/    — @moondrop/centralized-logger (npm package)
  client/    — @moondrop/logger-client (npm package)
examples/
  auth-service/       — NestJS auth (login/validate/logout)
  customer-support/   — NestJS tickets CRUD
  backend/            — NestJS gateway (uses LokiHttpModule)
  frontend/           — Vite vanilla JS frontend
  docker-compose.yml  — full stack in one command
docker/
  docker-compose.yml  — observability stack only (Loki + Tempo + Grafana)
  loki/               — Loki config
  tempo/              — Tempo config
  promtail/           — Promtail config
  grafana/            — Grafana provisioning (datasources + dashboards)
```

## Development

```bash
# Install
pnpm install

# Build both packages
pnpm build

# Typecheck
pnpm --filter @moondrop/centralized-logger typecheck
pnpm --filter @moondrop/logger-client exec tsc --noEmit
```
