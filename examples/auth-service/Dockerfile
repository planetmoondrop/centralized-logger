# ---- Base image ----
FROM public.ecr.aws/docker/library/node:lts-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# ---- Dependencies ----
FROM base AS deps
# Copy only the pnpm files and package.json for dependency resolution
COPY examples/auth-service/package.json examples/auth-service/.npmrc* ./
# Install only production dependencies
RUN CI=true pnpm install --prod

# ---- Builder ----
FROM base AS builder
WORKDIR /app
COPY examples/auth-service/ .
ENV CI=true
RUN pnpm install
RUN pnpm run build

# ---- Production ----
FROM public.ecr.aws/docker/library/node:lts-alpine AS prod
WORKDIR /app
ENV NODE=production
ENV CI=true

# Install openssl for crypto support
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S appuser -u 1001 -G nodejs

# Copy only necessary files
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/.env ./.env

RUN chown -R appuser:nodejs /app/node_modules

USER appuser

EXPOSE 8080

CMD ["node", "dist/main.js"]
