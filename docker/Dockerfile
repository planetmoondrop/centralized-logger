# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Enable PNPM
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package*.json pnpm-lock.yaml ./
COPY nestjs-loki-logger/package*.json ./nestjs-loki-logger/
RUN pnpm i --ignore-scripts

# Copy source and build
COPY . .
RUN pnpm run build


# ── Stage 2: Production image ────────────────────────────────────────
FROM node:20-alpine AS runner

# Enable PNPM
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy compiled output from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist

# Only install production dependencies
RUN pnpm install --production --frozen-lockfile --ignore-scripts && pnpm store prune

# Drop privileges
USER appuser

EXPOSE 3000

# Graceful shutdown — SIGTERM triggers onModuleDestroy() which flushes Loki buffer
STOPSIGNAL SIGTERM

CMD ["node", "dist/main"]
