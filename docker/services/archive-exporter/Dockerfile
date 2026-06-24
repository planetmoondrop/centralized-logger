FROM node:20-alpine

WORKDIR /app
COPY exporter.mjs scheduler.mjs .

# Node scheduler avoids dcron/setpgid, which fails with EPERM on some Docker setups (e.g. Docker Desktop).
CMD ["node", "/app/scheduler.mjs"]
