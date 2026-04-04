FROM node:20-alpine

WORKDIR /app
COPY exporter.mjs scheduler.mjs .

CMD ["node", "/app/scheduler.mjs"]
