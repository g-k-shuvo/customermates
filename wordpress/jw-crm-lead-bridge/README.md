# JW CRM Lead Bridge

Forwards Fluent Forms submissions to the CRM's web form endpoint, signed and with retries.

Works on free Fluent Forms. The Pro webhook integration was rejected for this job because it
cannot compute an HMAC — authentication would degrade to a static bearer token — and it has
no retry and no delivery log, so a failed POST is a silently lost lead.

## Install

1. Copy `jw-crm-lead-bridge/` into `wp-content/plugins/` and activate it. Activation creates
   the retry table and schedules the five-minute drain.
2. In the CRM, go to **Company → Web forms** and create a source. Copy the signing secret —
   it is shown once.
3. In WordPress, go to **Settings → CRM Lead Bridge** and fill in the CRM base URL, the
   signing secret, and the form mapping.

The mapping is one `<form id> = <source slug>` per line. A form that is not listed is never
forwarded, which is how you stage a rollout one form at a time:

```
3 = footer-callback
7 = contact-us
```

## Finding the forms you missed

An unlisted form is dropped silently, which is the failure mode that loses leads: a form
added after the mapping was written looks exactly like a form that is working.

So the plugin records every submission from a form with no mapping and lists them on the
settings screen with their id, title, submission count and when they were last seen. Mapping
a form removes it from that list; rows older than 30 days age out.

That makes installation a discovery step. Install it, submit each form on the site once, then
read the list — it is the authoritative form inventory, which is more reliable than working
from a page-by-page audit. Nobody currently knows how many forms the site has: three are
confirmed, and between eight and twelve are suspected.

Only the form id, title and a count are kept. The submitted values are not, because an
unmapped form is by definition one nobody has agreed to store yet.

## How delivery works

The plugin hooks `fluentform/submission_inserted` at priority 20, after Fluent Forms' own
integrations have run.

It signs the body as `t=<unix>,v0=<hmac>` in the `x-webform-signature` header, where the HMAC
is SHA-256 over `<timestamp>.<raw body>`. The CRM rejects a timestamp more than five minutes
old, so the server clocks need to be roughly in step.

`external_id` carries the Fluent Forms submission id. The CRM keys idempotency on it, which
is what makes retries and the backfill safe to run repeatedly.

Responses are read as:

| Code | Meaning | Plugin behaviour |
|------|---------|------------------|
| 202  | Accepted | Done |
| 200  | Duplicate — already held | Done; this is the expected answer when a retry follows a delivery that actually succeeded |
| 400  | Body could not be parsed | Permanent: emails the admin, does not retry |
| 401  | Signature rejected | Permanent: a bad secret or a clock skew is a configuration error, and six retries only delay someone noticing |
| 404  | No such source slug | Permanent: emails the admin, does not retry |
| 429  | Rate limited | Retried with backoff |
| 5xx / network | Transient | Retried with backoff |

Retries back off at 5m, 15m, 1h, 4h, 12h, 24h and give up after six attempts, emailing the
address configured on the settings screen. The Fluent Forms entry is never modified, so
anything that gives up can still be replayed with the backfill script once the cause is fixed.

## Backfilling historical entries

`scripts/backfill-fluent-forms.ts` in the CRM repository pages the `fluentform/v1` REST API
using an Application Password and posts each entry through the same endpoint.

Run it in dry-run first and reconcile the counts it prints against the Fluent Forms entry
counts in wp-admin:

```bash
WP_BASE_URL=https://site.example WP_USER=editor WP_APP_PASSWORD='xxxx yyyy' \
CRM_BASE_URL=https://crm.example CRM_SIGNING_SECRET=... \
npx tsx scripts/backfill-fluent-forms.ts --map 3=footer-callback --dry-run
```

Drop `--dry-run` to send. Because the CRM answers `duplicate` for entries it already holds,
re-running after a mapping change is safe — it will not create a second lead.

## Uninstalling

Deactivating keeps the queue and settings, so switching the plugin off for an afternoon does
not discard undelivered submissions. Deleting the plugin drops the retry table and the options.
