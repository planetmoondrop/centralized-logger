# Build context: repo root (set by docker-compose)
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/nestjs/package.json  ./packages/nestjs/
COPY packages/client/package.json  ./packages/client/
COPY examples/auth-service/package.json ./examples/auth-service/
RUN pnpm install --frozen-lockfile

COPY packages/nestjs/src            ./packages/nestjs/src
COPY packages/nestjs/tsconfig.json  ./packages/nestjs/
RUN pnpm --filter moondrop-centralized-logger build

COPY examples/auth-service/src          ./examples/auth-service/src
COPY examples/auth-service/tsconfig.json ./examples/auth-service/
RUN cd /app/examples/auth-service \
    && npm install --ignore-scripts --legacy-peer-deps --include=dev \
    && npx tsc

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/packages/nestjs/package.json  ./packages/nestjs/
COPY --from=builder /app/packages/nestjs/dist          ./packages/nestjs/dist/
COPY --from=builder /app/examples/auth-service/package.json  ./examples/auth-service/
COPY --from=builder /app/examples/auth-service/dist          ./examples/auth-service/dist/

# Install prod deps for the shared package (provides @nestjs/common etc.)
RUN cd /app/packages/nestjs && \
    npm install --ignore-scripts --legacy-peer-deps --omit=dev

# Install prod deps for the example (resolves moondrop-centralized-logger via local path)
RUN cd /app/examples/auth-service && \
    npm install --ignore-scripts --legacy-peer-deps --omit=dev

USER app
WORKDIR /app/examples/auth-service
EXPOSE 3001
STOPSIGNAL SIGTERM
CMD ["node", "dist/src/main"]
