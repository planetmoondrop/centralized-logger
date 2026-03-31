FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/nestjs/package.json  ./packages/nestjs/
COPY packages/client/package.json  ./packages/client/
COPY examples/customer-support/package.json ./examples/customer-support/
RUN pnpm install --ignore-scripts --filter moondrop-centralized-logger --filter @example/customer-support

COPY packages/nestjs/src       ./packages/nestjs/src
COPY packages/nestjs/tsconfig.json ./packages/nestjs/
RUN pnpm --filter moondrop-centralized-logger build

COPY examples/customer-support/src        ./examples/customer-support/src
COPY examples/customer-support/tsconfig.json ./examples/customer-support/
RUN pnpm --filter @example/customer-support exec npx tsc -p tsconfig.json

FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /app/package.json              ./
COPY --from=builder /app/pnpm-workspace.yaml       ./
COPY --from=builder /app/pnpm-lock.yaml            ./
COPY --from=builder /app/packages/nestjs/package.json   ./packages/nestjs/
COPY --from=builder /app/packages/nestjs/dist           ./packages/nestjs/dist/
COPY --from=builder /app/examples/customer-support/package.json  ./examples/customer-support/
COPY --from=builder /app/examples/customer-support/dist          ./examples/customer-support/dist/

RUN pnpm install --ignore-scripts --filter @example/customer-support --prod && pnpm store prune

USER app
WORKDIR /app/examples/customer-support
EXPOSE 3002
STOPSIGNAL SIGTERM
CMD ["node", "dist/main"]
