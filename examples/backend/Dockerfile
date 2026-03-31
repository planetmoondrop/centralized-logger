FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/nestjs/package.json  ./packages/nestjs/
COPY packages/client/package.json  ./packages/client/
COPY examples/backend/package.json ./examples/backend/
RUN pnpm install --ignore-scripts --filter moondrop-centralized-logger --filter @example/backend

COPY packages/nestjs/src       ./packages/nestjs/src
COPY packages/nestjs/tsconfig.json ./packages/nestjs/
RUN pnpm --filter moondrop-centralized-logger build

COPY examples/backend/src        ./examples/backend/src
COPY examples/backend/tsconfig.json ./examples/backend/
RUN pnpm --filter @example/backend exec npx tsc -p tsconfig.json

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/package.json         ./
COPY --from=builder /app/pnpm-workspace.yaml  ./
COPY --from=builder /app/pnpm-lock.yaml       ./
COPY --from=builder /app/packages/nestjs/package.json  ./packages/nestjs/
COPY --from=builder /app/packages/nestjs/dist          ./packages/nestjs/dist/
COPY --from=builder /app/examples/backend/package.json ./examples/backend/
COPY --from=builder /app/examples/backend/dist         ./examples/backend/dist/

RUN pnpm install --ignore-scripts --filter @example/backend --prod && pnpm store prune

USER app
WORKDIR /app/examples/backend
EXPOSE 3003
STOPSIGNAL SIGTERM
CMD ["node", "dist/main"]
