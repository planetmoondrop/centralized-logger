# ------------------------------------------------------------------------------
# Stage 1: Base
# ------------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app

RUN npm install -g pnpm
RUN npm install -g typescript@5.6

# ------------------------------------------------------------------------------
# Stage 2: Dependencies
# ------------------------------------------------------------------------------
FROM base AS deps

# Copy workspace files
COPY pnpm-lock.yaml package.json ./
RUN printf 'packages:\n  - packages/*\n  - examples/*\n' > pnpm-workspace.yaml

# Copy only package.jsons (better caching)
COPY packages/nestjs/package.json packages/nestjs/
COPY examples/backend/package.json examples/backend/

# Install all deps (with hoisting for TS resolution)
RUN pnpm install --shamefully-hoist \
  && pnpm add -Dw typescript@5.6

# ------------------------------------------------------------------------------
# Stage 3: Builder
# ------------------------------------------------------------------------------
FROM base AS builder

# Copy everything from deps
COPY --from=deps /app /app

# Copy source code
COPY packages/nestjs ./packages/nestjs
COPY examples/backend ./examples/backend

# Symlink global tsc into each package that needs it
RUN ln -sf /usr/local/lib/node_modules/typescript/bin/tsc /app/packages/nestjs/node_modules/.bin/tsc || true
RUN ln -sf /usr/local/lib/node_modules/typescript/bin/tsc /app/packages/client/node_modules/.bin/tsc || true

# Build all workspace packages
RUN pnpm -r build

# Prune dev deps
ENV CI=true
RUN pnpm prune --prod

# ------------------------------------------------------------------------------
# Stage 4: Production
# ------------------------------------------------------------------------------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

# Non-root user
RUN addgroup -S nodejs && adduser -S appuser -G nodejs

# Copy node_modules + built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/examples/backend/dist ./dist

# Copy package.json (optional but good)
COPY --from=builder /app/examples/backend/package.json ./package.json
COPY --from=builder /app/packages/nestjs ./node_modules/@moondrop/centralized-logger

# Permissions
RUN chown -R appuser:nodejs /app
USER appuser

EXPOSE 8080
CMD ["node", "dist/main.js"]