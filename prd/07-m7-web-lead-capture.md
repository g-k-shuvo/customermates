# PRD 07 — M7: Web lead capture (WordPress / Fluent Forms)

**Estimate:** 9–14 days · **Depends on:** M2 (pipelines exist) · **Blocks:** nothing

Every form submission on the marketing site lands in the CRM as a Lead, with the contact
and organization created or matched, the owner notified, and the raw payload retained.

---

## Findings this is built on

Verified against the live site and the CRM source on 5 Sep 2026.

**The site.** `mistyrose-sardine-560260.hostingersite.com` is the Jackim Woods & Co.
rebuild. Its REST index exposes `fluentform/v1`, so **Fluent Forms is confirmed active**.
Application Passwords are enabled, which gives us an authenticated read path for backfill.
The `fluentform/v1` namespace exposes `revenue-chart`, `subscriptions`, `payment-types` and
`conversational-design` routes — all Pro modules — which **strongly suggests Fluent Forms
Pro**, though this must be confirmed in wp-admin before relying on it.

Forms found so far: **Request a Call** (Full name, Work email, Company, "What's on your
mind?"), **Business Valuation Calculator**, **Free Market Assessment**. The live
`jackimwoods.com` additionally has **Buyer Registration** and a footer callback form
(First Name, Last Name, Email, Phone, Message). The client's current lead inbox also shows
**Seller Registration**, an **EBITDA Worksheet**, a **Court Reporting & Litigation Support
whitepaper** and a **Simple Rules of Thumb** download — so assume **8–12 distinct forms**,
not three. The mapping layer has to be configurable, not hard-coded.

**The CRM.** There is **no Lead entity** — `grep "^model Lead" prisma/schema.prisma`
returns nothing. There is no inbound form endpoint. There are, however, two existing
inbound webhook receivers to copy: `app/api/webhooks/lemonsqueezy/route.ts` and
`app/api/webhooks/unipile/v2/route.ts`, both using `verifyHmacSha256Hex` from
`core/utils/hmac`.

**Two mapping traps in the Contact model.** `Contact` has **no email and no phone column**.
Email lives in `ContactIdentifier` as `{ provider: "mail", value }`. And
`MessagingProvider` is `mail | google | outlook | whatsapp | linkedin | telegram |
instagram` — **there is no phone provider**, so a plain phone number from a web form has
to go into a `phone`-type `CustomColumn`. Both of these will bite whoever writes the
mapper if it is not stated up front.

---

## T7.1 — The Lead entity

A whitepaper download is not a deal. Without Leads, 115 unqualified downloads either
pollute the pipeline or get dropped. Build this first.

```prisma
enum LeadStatus { new working qualified unqualified converted archived }

model Lead {
  id              String     @id @default(uuid())
  companyId       String
  title           String
  status          LeadStatus @default(new)
  sourceOrigin    String     @default("manual")
  sourceId        String?
  contactId       String?
  organizationId  String?
  ownerUserId     String?
  labels          String[]   @default([])
  value           Float?
  notes           Json?
  convertedDealId String?
  convertedAt     DateTime?
  archivedAt      DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  company      Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  source       WebFormSource? @relation(fields: [sourceId], references: [id], onDelete: SetNull)
  contact      Contact?       @relation(fields: [contactId], references: [id], onDelete: SetNull)
  organization Organization?  @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  owner        User?          @relation(fields: [ownerUserId], references: [id], onDelete: SetNull)

  @@index([companyId, status, createdAt])
  @@index([companyId, ownerUserId])
  @@index([contactId])
}
```

Full feature slice at `features/leads/` following `features/deals` — schema, repos,
create/update/delete/get interactors, colocated `.openapi.ts` per operation, DI
registration. Add `leads` to the `Resource` enum and seed `RolePermission` rows for it in
the same migration.

**Convert to deal.** `ConvertLeadToDealInteractor` — creates a Deal in a nominated
pipeline and stage, carries the contact and organization links across, sets
`status = converted`, `convertedDealId`, `convertedAt`. The lead stays as a record; it is
not deleted.

**Leads Inbox UI.** A list view at `/leads` reusing the existing data-view components:
columns for title, status, labels, source, owner, next activity, created date. Filterable
and sortable like every other entity. Bulk actions for assign-owner, label and archive.

---

## T7.2 — Web form sources and raw submission log

```prisma
model WebFormSource {
  id             String   @id @default(uuid())
  companyId      String
  name           String
  slug           String
  signingSecret  String
  active         Boolean  @default(true)
  defaultOwnerId String?
  defaultLabels  String[] @default([])
  fieldMapping   Json
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  company        Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  submissions    WebFormSubmission[]
  leads          Lead[]

  @@unique([companyId, slug])
}

model WebFormSubmission {
  id          String        @id @default(uuid())
  companyId   String
  sourceId    String
  externalId  String?
  rawPayload  Json
  status      String        @default("received")
  error       String?
  leadId      String?
  receivedAt  DateTime      @default(now())
  processedAt DateTime?
  company     Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  source      WebFormSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@unique([sourceId, externalId])
  @@index([companyId, receivedAt])
  @@index([status])
}
```

`@@unique([sourceId, externalId])` carries the Fluent Forms entry id and is what makes
delivery **idempotent** — a retry or a double-fire creates nothing new. This is the single
most important line in the schema for this feature.

Always store the raw payload before mapping. When a mapping is wrong you want to fix it and
replay, not ask the client to resubmit the form.

---

## T7.3 — The inbound endpoint

`POST /api/webforms/[slug]` — public route, outside `/v1`, no session.

Copy the signature scheme already used by `app/api/webhooks/unipile/v2/route.ts`:

- Header `x-webform-signature: t=<unix seconds>,v0=<hex hmac>`
- HMAC-SHA256 over `` `${t}.${rawBody}` `` using the source's `signingSecret`
- Reject a timestamp skew over 300 seconds — this is the replay guard
- Use `verifyHmacSha256Hex` from `core/utils/hmac`

Order of operations:

1. Resolve the source by slug. Unknown or inactive → `404`.
2. Verify the signature. Bad or missing → `401`.
3. Insert `WebFormSubmission` with the raw body. Unique violation on
   `(sourceId, externalId)` → return `200` with `{ "status": "duplicate" }` and stop.
4. Return **`202 Accepted` immediately.** Do not process inline. A slow CRM must never
   make the visitor's form hang.
5. Process asynchronously on the existing workflow runner (`workflows/`,
   `WORKFLOW_TARGET_WORLD`).

Rate-limit per slug — there is no general rate limiter in the codebase today, only
better-auth's. A simple per-source counter in Postgres is enough; this endpoint is public
and will be found by scanners.

---

## T7.4 — Mapping and record resolution

`fieldMapping` is JSON on the source, editable in the CRM UI. Dot paths into the Fluent
Forms payload:

```json
{
  "firstName":        "names.first_name",
  "lastName":         "names.last_name",
  "email":            "email",
  "phone":            "phone",
  "organizationName": "company",
  "message":          "message",
  "titleTemplate":    "{{organizationName}} — {{form_title}}",
  "customFields": {
    "<customColumnId>": "annual_revenue",
    "<customColumnId>": "industry"
  }
}
```

Resolution order, all inside one transaction:

1. **Contact — find or create by email.** `ContactIdentifier` carries
   `@@unique([companyId, channelClass, value])`, so an email address can exist only once
   per company. Use it as the dedupe key: look up the identifier, take its contact, else
   create the contact with `identifiers: [{ provider: "mail", value: email }]`.
   Never create a second contact for an email that already exists.
2. **Organization — find or create.** Match on exact name first, then on the email domain
   against existing organizations, and only then create. Free-mail domains (gmail,
   outlook, yahoo, …) must be excluded from domain matching or every gmail lead joins one
   giant organization.
3. **Phone** goes to the configured `phone`-type custom column, not to the contact.
   There is no phone field and no phone provider.
4. **Lead** — create it, link contact and organization, apply `defaultLabels` and
   `defaultOwnerId`, set `sourceOrigin = "webform"`, store the message in `notes`.
5. Update the submission row to `processed` with its `leadId`.
6. Publish `DomainEvent.LEAD_CREATED`.

Any failure sets `status = "failed"` with the error, keeps the raw payload, and is
retryable from the UI. A mapping bug must never lose a lead.

---

## T7.5 — Notification and follow-up

A listener on `LEAD_CREATED`:

- Emails the owner (or a configured address) with the form name, the person, the
  organization and a deep link to the lead. This is what the client relies on today —
  their words: *"When a new lead arrives, an automation sends me an email letting me know
  to follow up."*
- Optionally creates a follow-up Task due in N hours, per source. Depends on M5 for due
  dates; until then create an untyped task.

Both configurable per source, both off by default.

---

## T7.6 — The WordPress side

Two options. **Recommend B**, use A only for a same-day pilot.

### Option A — Fluent Forms Pro webhook, no code

Pro ships a Webhook integration: POST, JSON body, **custom headers**, and per-form
conditional logic. Point it at `/api/webforms/<slug>`.

Its limits matter: **it cannot compute an HMAC**, so authentication degrades to a static
bearer token in a header. It has no retry and no delivery log, so a failed POST is a
silently lost lead. Requires a Pro licence.

If used, accept a static `x-webform-token` on the endpoint as an alternative to the
signature, and rate-limit harder.

### Option B — A small companion plugin (works on free Fluent Forms)

About 150 lines. Hook the documented action:

```php
add_action('fluentform/submission_inserted', function ($submissionId, $formData, $form) {
    $map = get_option('jw_crm_form_map', []);
    if (empty($map[$form->id])) return;

    $payload = wp_json_encode([
        'external_id'  => (string) $submissionId,
        'form_id'      => (int) $form->id,
        'form_title'   => $form->title,
        'submitted_at' => gmdate('c'),
        'page_url'     => $_SERVER['HTTP_REFERER'] ?? '',
        'fields'       => $formData,
    ]);

    $t   = time();
    $sig = hash_hmac('sha256', $t . '.' . $payload, JW_CRM_SIGNING_SECRET);

    $res = wp_remote_post(JW_CRM_BASE . '/api/webforms/' . $map[$form->id], [
        'timeout' => 8,
        'headers' => [
            'Content-Type'        => 'application/json',
            'x-webform-signature' => "t={$t},v0={$sig}",
        ],
        'body' => $payload,
    ]);

    $code = is_wp_error($res) ? 0 : wp_remote_retrieve_response_code($res);
    if ($code < 200 || $code > 299) {
        jw_crm_queue_retry($submissionId, $map[$form->id], $payload);
    }
}, 20, 3);
```

Plus a retry queue in its own table, drained by WP-Cron every five minutes with backoff,
giving up after six attempts and emailing an admin. And a settings screen mapping each
Fluent Forms form id to a CRM source slug.

Signature `($submissionId, $formData, $form)` at priority 10, 3 args — use 20 so the
plugin runs after Fluent Forms' own integrations.

Why B: HMAC, retries, a delivery log, works whether or not they hold a Pro licence, and
one place to change when a form is added.

---

## T7.7 — Backfill the existing entries

Application Passwords are enabled on the site, and `fluentform/v1` exposes
`GET /submissions` and `GET /forms/{id}/fields`. A one-off script can page through every
historical entry and POST it through the same endpoint — idempotency on `externalId` means
it can be run repeatedly while the mapping is tuned.

Run it in dry-run first and reconcile counts per form against the Fluent Forms entry
counts in wp-admin.

---

## Acceptance

- Submitting each live form creates exactly one Lead with the contact and organization
  correctly matched or created.
- Submitting the same form twice with the same email creates **two leads and one contact**.
- Replaying a webhook delivery creates nothing new.
- A tampered body or a timestamp older than five minutes is rejected with `401`.
- The endpoint answers in under 500 ms regardless of downstream processing time.
- A deliberately broken mapping produces a `failed` submission with the raw payload intact,
  and fixing the mapping and replaying produces the correct lead.
- The owner receives a notification email within a minute.
- Historical entries backfill with counts reconciling per form.
- Conventions green, five locales updated, OpenAPI regenerated.
