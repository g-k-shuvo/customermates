#!/bin/sh
set -eu

: "${APP_INTERNAL_URL:=http://app:4000}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "cron: CRON_SECRET is not set; scheduled jobs would be rejected with 401. Refusing to start." >&2
  exit 1
fi

umask 077
cat > /etc/cron-env.sh <<ENV
export APP_INTERNAL_URL='${APP_INTERNAL_URL}'
export CRON_SECRET='${CRON_SECRET}'
ENV

cat > /etc/crontabs/root <<'CRONTAB'
*/5 * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job sync-mailboxes
0 * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job reprocess-webhook-events
0 9 * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job lifecycle
CRONTAB

echo "cron: scheduling sync-mailboxes (*/5), reprocess-webhook-events (hourly), lifecycle (daily 09:00) against ${APP_INTERNAL_URL}"

exec crond -f -l 8
