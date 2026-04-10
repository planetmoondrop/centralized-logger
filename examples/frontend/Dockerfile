# ---- Base image ----
FROM public.ecr.aws/docker/library/node:lts-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# ---- Dependencies ----
FROM base AS deps
# Copy only the pnpm files and package.json for dependency resolution
COPY package.json .npmrc ./
# Generate lock file and install production dependencies
RUN pnpm install --prod --no-frozen-lockfile

# ---- Builder ----
FROM base AS builder
WORKDIR /app
COPY . .
# Install all dependencies including dev
RUN pnpm install --no-frozen-lockfile
RUN pnpm run build

# ---- Production ----
FROM public.ecr.aws/docker/library/node:lts-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production

# Install openssl for crypto support
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S appuser -u 1001 -G nodejs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy package.json for potential debugging (optional)
COPY --from=builder /app/package.json ./

# Set correct permissions
RUN chown -R appuser:nodejs /app

USER appuser

EXPOSE 8080

# Next.js standalone server expects to run server.js
CMD ["node", "server.js"]