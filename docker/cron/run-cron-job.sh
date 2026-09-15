#!/bin/sh
set -eu

job="$1"
url="${APP_INTERNAL_URL}/api/cron/${job}"

status=$(curl -sS -o /tmp/cron-${job}.out -w '%{http_code}' \
  --max-time 120 \
  -H "authorization: Bearer ${CRON_SECRET}" \
  "$url" || echo "000")

if [ "$status" = "200" ]; then
  echo "cron ${job}: ok"
else
  echo "cron ${job}: HTTP ${status}" >&2
  head -c 500 /tmp/cron-${job}.out >&2 2>/dev/null || true
  echo >&2
fi
