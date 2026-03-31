# Build context: repo root (set by docker-compose)
# This gives access to packages/ so file:../../packages/nestjs resolves correctly.

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# 1. Install workspace packages (needed to resolve file: deps)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/nestjs/package.json  ./packages/nestjs/
COPY packages/client/package.json  ./packages/client/
COPY examples/auth-service/package.json ./examples/auth-service/
RUN pnpm install --ignore-scripts --filter moondrop-centralized-logger --filter @example/auth-service

# 2. Build the logger package first
COPY packages/nestjs/src  ./packages/nestjs/src
COPY packages/nestjs/tsconfig.json ./packages/nestjs/
RUN pnpm --filter moondrop-centralized-logger build

# 3. Build the service
COPY examples/auth-service/src       ./examples/auth-service/src
COPY examples/auth-service/tsconfig.json ./examples/auth-service/
RUN pnpm --filter @example/auth-service exec npx tsc -p tsconfig.json

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/package.json             ./
COPY --from=builder /app/pnpm-workspace.yaml      ./
COPY --from=builder /app/pnpm-lock.yaml           ./
COPY --from=builder /app/packages/nestjs/package.json  ./packages/nestjs/
COPY --from=builder /app/packages/nestjs/dist          ./packages/nestjs/dist/
COPY --from=builder /app/examples/auth-service/package.json  ./examples/auth-service/
COPY --from=builder /app/examples/auth-service/dist          ./examples/auth-service/dist/

RUN pnpm install --ignore-scripts --filter @example/auth-service --prod && pnpm store prune

USER app
WORKDIR /app/examples/auth-service
EXPOSE 3001
STOPSIGNAL SIGTERM
CMD ["node", "dist/main"]
