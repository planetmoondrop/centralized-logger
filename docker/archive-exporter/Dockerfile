FROM node:20-alpine

# Install dcron (lightweight cron daemon for Alpine)
RUN apk add --no-cache dcron

WORKDIR /app
COPY exporter.mjs .

# Install the crontab
COPY crontab /etc/crontabs/root

# Forward cron output to Docker logs
RUN touch /var/log/archive-exporter.log

# ENTRYPOINT: export all env vars so cron jobs inherit them, then start crond
# -f keeps dcron in the foreground so Docker tracks the process
CMD printenv > /etc/environment && \
    tail -F /var/log/archive-exporter.log & \
    crond -f -l 2
