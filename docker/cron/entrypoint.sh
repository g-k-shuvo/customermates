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
* * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job mail-outbox
*/15 * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job sync-calendars
*/5 * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job automations
0 * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job reprocess-webhook-events
0 9 * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job lifecycle
20 * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job sweep-record-files
25 * * * * . /etc/cron-env.sh && /usr/local/bin/run-cron-job sweep-record-documents
CRONTAB

echo "cron: scheduling sync-mailboxes (*/5), mail-outbox (every minute), sync-calendars (*/15), automations (*/5; schedules fire only with AUTOMATION_SCHEDULE_ENABLED=true), reprocess-webhook-events (hourly), lifecycle (daily 09:00), sweep-record-files and sweep-record-documents (hourly) against ${APP_INTERNAL_URL}"

exec crond -f -l 8
