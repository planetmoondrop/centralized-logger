FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/nestjs/package.json  ./packages/nestjs/
COPY packages/client/package.json  ./packages/client/
COPY examples/backend/package.json ./examples/backend/
RUN pnpm install --frozen-lockfile

COPY packages/nestjs/src            ./packages/nestjs/src
COPY packages/nestjs/tsconfig.json  ./packages/nestjs/
RUN pnpm --filter moondrop-centralized-logger build

COPY examples/backend/src           ./examples/backend/src
COPY examples/backend/tsconfig.json ./examples/backend/
RUN cd /app/examples/backend \
    && npm install --ignore-scripts --legacy-peer-deps --include=dev \
    && npx tsc

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/packages/nestjs/package.json  ./packages/nestjs/
COPY --from=builder /app/packages/nestjs/dist          ./packages/nestjs/dist/
COPY --from=builder /app/examples/backend/package.json ./examples/backend/
COPY --from=builder /app/examples/backend/dist         ./examples/backend/dist/

# Install prod deps for the shared package (provides @nestjs/common etc.)
RUN cd /app/packages/nestjs && \
    npm install --ignore-scripts --legacy-peer-deps --omit=dev

# Install prod deps for the example
RUN cd /app/examples/backend && \
    npm install --ignore-scripts --legacy-peer-deps --omit=dev

USER app
WORKDIR /app/examples/backend
EXPOSE 3003
STOPSIGNAL SIGTERM
CMD ["node", "dist/src/main"]
