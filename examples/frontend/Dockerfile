# Build context: repo root (set in docker-compose)
# This mirrors the original Vite Dockerfile structure exactly.

FROM node:20-alpine AS builder
WORKDIR /app

# 1. Build @planetmoondrop/logger-client package
COPY packages/client/package.json ./packages/client/
RUN cd packages/client && npm install --ignore-scripts
COPY packages/client/src         ./packages/client/src
COPY packages/client/tsconfig.json ./packages/client/
RUN cd packages/client && npm run build

# 2. Install frontend deps
#    npm resolves file:../../packages/client correctly since it's already built above
COPY examples/frontend/package.json ./examples/frontend/
RUN cd examples/frontend && npm install --legacy-peer-deps --install-links

# 3. Build Next.js app
COPY examples/frontend/src         ./examples/frontend/src
COPY examples/frontend/next.config.js ./examples/frontend/
COPY examples/frontend/tsconfig.json  ./examples/frontend/
COPY examples/frontend/tailwind.config.ts ./examples/frontend/
COPY examples/frontend/postcss.config.js  ./examples/frontend/

ARG NEXT_PUBLIC_API_URL=http://localhost:3003/api
ARG NEXT_PUBLIC_TRACE_VIEWER=http://localhost:3003/_trace
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_TRACE_VIEWER=$NEXT_PUBLIC_TRACE_VIEWER

RUN cd examples/frontend && npm run build

# 4. Runtime — lean Next.js standalone image
FROM node:20-alpine AS runner
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/examples/frontend/.next/standalone ./
COPY --from=builder /app/examples/frontend/.next/static     ./.next/static
# COPY --from=builder /app/examples/frontend/public           ./public

USER app
EXPOSE 5173
ENV PORT=5173
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
