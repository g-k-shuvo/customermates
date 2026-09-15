FROM alpine:3.21
RUN apk add --no-cache curl
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY run-cron-job.sh /usr/local/bin/run-cron-job
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/run-cron-job
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
