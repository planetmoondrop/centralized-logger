# Examples

Three NestJS backends + one Vite frontend that exercise the full
`moondrop-centralized-logger` stack end-to-end.

```
┌──────────────────────────────────────────────────────────┐
│                  frontend  :5173                          │
│  (Vite + @moondrop/logger-client)                        │
│  Captures x-loki-trace-id from every response header     │
│  and injects it into every outgoing request              │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTP
┌────────────────────▼─────────────────────────────────────┐
│              backend (gateway)  :3003                     │
│  LokiHttpModule — propagates traceId + spanId on every   │
│  downstream call automatically                           │
└─────────────┬───────────────────────────┬────────────────┘
              │ HTTP                       │ HTTP
┌─────────────▼────────────┐  ┌───────────▼───────────────┐
│   auth-service  :3001    │  │  customer-support  :3002   │
│   login / validate       │  │  tickets CRUD              │
└──────────────────────────┘  └────────────────────────────┘
              │                            │
              └──────────────┬─────────────┘
                             ▼
              ┌──────────────────────────────┐
              │  Loki :3100  Tempo :3200      │
              │  Grafana :3000               │
              └──────────────────────────────┘
```

## Prerequisites

- Docker 24+ and Docker Compose v2

That's it. All builds happen inside Docker.

## Run the full stack

From the `examples/` directory:

```bash
docker compose up --build
```

First run takes a few minutes while Docker builds all four app images.
Subsequent runs are fast — layers are cached unless source files change.

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend (gateway) | http://localhost:3003 |
| Auth service | http://localhost:3001 |
| Customer support | http://localhost:3002 |
| Grafana | http://localhost:3000 |
| Loki | http://localhost:3100 |
| Tempo | http://localhost:3200 |

Grafana opens with anonymous admin access — no login required.

## Demo credentials

| Email | Password | Role |
|-------|----------|------|
| admin@example.com | password123 | admin |
| agent@example.com | password456 | agent |
| customer@example.com | password789 | customer |

## Testing the trace journey

1. Open http://localhost:5173 and log in with any credentials above.
2. Create a ticket, change its status, refresh the list.
   Each action goes: frontend → backend → auth-service + customer-support.
3. The **Last x-loki-trace-id** box in the sidebar captures the response
   header automatically (via `@moondrop/logger-client`).
4. Click **Open Trace Viewer ↗** to open the built-in viewer on the gateway
   and see the full cross-service log sequence for that exact request.
5. In Grafana → **NestJS / Trace Journey Explorer**, paste the same trace ID
   to see every span across all three services on one dashboard.
6. In Grafana → **NestJS / Universal Log Search**, search by email, userId,
   ticket ID, or any value to find logs across all services.

## Stop / clean up

```bash
# Stop containers, keep volumes (Loki data persists)
docker compose down

# Stop and delete all volumes (wipes Loki/Grafana data)
docker compose down -v
```

## Local development (without Docker)

If you want to run the services directly with Node for faster iteration:

```bash
# From repo root — build the packages once
pnpm install
pnpm --filter moondrop-centralized-logger build
pnpm --filter @moondrop/logger-client build

# Install each example's deps (uses file: references to local dist)
cd examples/auth-service     && pnpm install --ignore-scripts && cd ../..
cd examples/customer-support && pnpm install --ignore-scripts && cd ../..
cd examples/backend          && pnpm install --ignore-scripts && cd ../..
cd examples/frontend         && pnpm install --ignore-scripts && cd ../..

# Start the observability stack only
cd docker && docker compose up -d && cd ..

# Start each service in a separate terminal
cd examples/auth-service     && pnpm start   # terminal 1
cd examples/customer-support && pnpm start   # terminal 2
cd examples/backend          && pnpm start   # terminal 3
cd examples/frontend         && pnpm dev     # terminal 4
```

Services default to `localhost` for all URLs when `LOKI_HOST`, `AUTH_SERVICE_URL`,
and `SUPPORT_SERVICE_URL` env vars are not set.
