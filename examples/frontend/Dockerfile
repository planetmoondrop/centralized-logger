FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/client/package.json  ./packages/client/
COPY examples/frontend/package.json ./examples/frontend/
RUN pnpm install --ignore-scripts --filter @moondrop/logger-client --filter @example/frontend

# Build logger-client first
COPY packages/client/src        ./packages/client/src
COPY packages/client/tsconfig.json ./packages/client/
RUN pnpm --filter @moondrop/logger-client build

# Build frontend — VITE_API_URL and VITE_TRACE_VIEWER are baked in at build time.
# They point at the host-accessible backend so the browser can reach it.
COPY examples/frontend/ ./examples/frontend/
ARG VITE_API_URL=http://localhost:3003/api
ARG VITE_TRACE_VIEWER=http://localhost:3003/_trace
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TRACE_VIEWER=$VITE_TRACE_VIEWER
WORKDIR /app/examples/frontend
RUN pnpm exec vite build

FROM nginx:1.25-alpine AS runner
COPY --from=builder /app/examples/frontend/dist /usr/share/nginx/html
COPY examples/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
