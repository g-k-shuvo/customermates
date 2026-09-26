# PRD 10 — Implementation plan

Supersedes the estimate in `09-observed-client-usage.md`. That document was committed by
`ac878e31 feat(mailbox): make email reachable from the app` — the same commit that shipped
the email feature it calls a blocker — and was never reconciled against `07-m7-email-integration.md`.
Its milestone references are also off by one: it calls web lead capture "M7"; the plan has
that as M8, and M7 is the email milestone.

Written against `merge/upstream-2026-09` at `0b8edf7c`. Every file:line below was verified
against the working tree. Six analysis passes, one adversarial verification pass and one
programme review fed this document; where they disagreed, the disagreement is recorded rather
than averaged.

---

## 0. What has already shipped

PRD 09 priced these as work still to do. They are delivered.

| PRD 09 item | Reality |
|---|---|
| Email sync — "BLOCKER", +30–50d, "revisit the base choice" | **Delivered.** `features/mailbox/` is 87 files, zero `@/ee/` imports, live at `/mail`, not self-hosted gated. M7 records 9 tasks, 8 commits, 308 tests against a real Greenmail IMAP/SMTP container. |
| Leads + web lead capture, 9–14d | **Delivered** as M8. `features/leads/` 34 files, `features/webform/` 35 files, HMAC-signed public ingest, WordPress/Fluent Forms bridge. |
| Automation port to n8n, 10–15d | **Engine delivered natively.** 4 trigger kinds, 11 action kinds, durable delays, run history. But 0 of the client's 6 named automations work — see §5.B. |
| "Only INBOX is synced" (M7 known gaps) | **Stale.** `features/mailbox/sync/select-sync-folders.ts:6` selects `\Sent` and `\Archive`; `workflows/sync-mailboxes.ts:118` drains every folder. |

`ConnectedAccount` is **not** unavailable: `features/mailbox/persistence/prisma-mailbox.repository.ts:325`
creates rows with a synthetic `imap:<uuid>` key by design. What remains ee-bound is `Calendar`,
`CalendarEvent` and `AccountActivity`.

---

## 1. Locked decisions

| # | Decision | Consequence |
|---|---|---|
| D-1 | **Narrow audience resolver.** New `features/audience/` with its own query path. `core/base/base-query-builder.ts` stays untouched. | Avoids churning a file 8 data-view surfaces, the widget calculator and grouping all read. Cost: a second query path maintained forever. ⚠️ Two parity tasks violate this — see §7.A4. |
| D-2 | **One shared `features/messaging-send/`** owning templates, merge fields, suppression/unsubscribe and delivery tracking. Consumed by automations *and* campaigns. | Suppression and unsubscribe are compliance-critical and must not diverge. |
| D-3 | **S3-compatible storage behind `core/storage/`**, MinIO in the CRM's own compose stack, presigned upload/download. | Not merely preferred — `rest-openapi-coverage.test.ts` permits exactly one body read on a `/v1` route (`request.json()`); `formData`/`text`/`blob`/`arrayBuffer` are rejected. Presign is the only design the harness allows. |
| D-4 | **`relation` member on `CustomColumnType`** + target FKs on `CustomFieldValue`. | Generalises "Opportunity Company" / "Referral Contact" to any entity. Forces a relation branch through filtering, grouping, import/export and the detail UI. |
| D-5 | **`Deal.baseValue`**, editable; `totalValue = baseValue + Σ(service × quantity)`; conversion writes `lead.value`. | Fixes the €50,000 lead → €0 deal. Touches `recalculateTotals` (13 references). ⚠️ Couples into invoicing — see §8 R-7. |
| D-6 | **Invoices built to full Tier 2.** | 12–18d, +3–5 if tax is anything beyond a flat per-line rate. Needs an accountant and a named sign-off on PDF layout. |
| D-7 | **`appendNote` repair: census first.** | Query in §4. Dev-database census returned 4 type-corrupted rows, 0 with destroyed content. |
| D-8 | **Full programme, one number.** | Recorded objection in §2. |

---

## 2. The number, and the objection to presenting it as one

```
Raw sum with locked decisions applied          255.0 d
  − identified cross-plan overlap              − 12.25
  + unbudgeted cross-plan glue                 +  5.0
                                               ────────
Reconciled engineering total                   ~247.75  →  245–250 d
```

Overlap is only 5% because the six plans were written against disjoint feature areas. The
money is not in double-counting — it is in the *interfaces between* them, which cost more to
reconcile than the duplication saves.

**The missing rebase buffer.** Only the messaging cluster carries a CI/locale/rebase buffer
(+20%). The other four carry none. Upstream pushes ~87 commits/month; across ~12 months that
is ~870 commits to rebase through while adding ~25 Prisma models, ~8 page families, ~60 DI
factories and ~15 locale namespaces. Applying 20% uniformly to the unbuffered 178 days adds
**~35 days**. Not included above. With it, the honest figure is **~280 days**.

### Calendar

| | Engineer-days | Elapsed |
|---|---|---|
| One developer | 235–270 (incl. rebase + CI round-trips) | **15–17 months p50, 18–20 p80** |
| Two developers | ~1.6× speedup, not 2× | **9–10.5 months** |

Parallelism is capped by `core/di.ts`, `prisma/schema.prisma`, the five locale catalogues,
`base-repository.ts`, the shared convention counters and one CI pipeline. Even on the most
generous assumptions — 4.5 productive days/week, zero rebase tax, zero decision latency —
200–230 ÷ 4.5 = 44–51 weeks. **"9–11 months solo" is below the floor of its own optimistic
case; it is the two-developer number.**

A part-time release/infra engineer owning the Linux conventions harness, CI green, the
Coolify/MinIO stack, DNS and release verification returns more than a third developer would,
and removes the bus-factor-of-one on the infra half.

### Recorded objection

The programme review recommends **against** the single-number framing, for four reasons:
~30% of scope is gated on answers nobody has (DocuSign, invoice usage, the client's mail
provider, dedupe scope); the one number hides a 200→280 spread; CLAUDE.md's "prefer additive
files, every line we touch is a future merge conflict" and this scope are mutually
incompatible, and someone must choose which to break; and a 15-month solo engagement on a
client's production CRM has a bus factor of one.

Its alternative — same total, three funded increments, each ending shippable:

- **Increment A (~40d)** — week-0 decisions and spikes, all live defects, org email history,
  sent-sync plumbing, submissions inbox, lead webhooks, days-in-stage bar, and the dedupe
  *scan* half delivering the 229 duplicate groups for review.
- **Increment B (~50d)** — storage, record files, documents-as-stored-PDFs, dedupe merge,
  relation custom fields, web-form mapping.
- **Increment C (~60d)** — messaging-send, lists, audience, campaigns, suppression,
  unsubscribe, bounce handling, compliance gate.

This plan proceeds as one programme per D-8. The increment boundaries are marked in §5 so the
decision stays reversible.

---

## 3. Stage −1 — Week 0. Decisions, spikes, census. ~5 days, mostly not code.

Nothing here is feature work, and every item can invalidate or halve a downstream block.

### Decisions that gate scope

| # | Question | Gates |
|---|---|---|
| **D1** | Client's mail provider and tenant policy. Microsoft 365 with basic auth disabled? | If yes, the entire mailbox feature is already dead in their environment and OAuth (10–12d **+ 4–8 weeks provider verification**) jumps to the top. All of §5.F.4 hangs on this. **Answer before quoting any mailbox date.** |
| **D2** | Do they already pay for DocuSign? | Documents: 2–3d (stored PDFs) vs 7–11d + a certification wait. |
| **D3** | Are invoices used, or a leftover tab? | 0 / 5–7 / 12–18 days. D-6 locks Tier 2; this question can still unlock it. |
| **D4** | `Deal.baseValue` semantics — confirm D-5 and its invoice coupling. | §5.A + §5.F.1 + §8 R-7. |
| **D5** | ESP choice, **separate sending domain**, EU/US transfer position. | Any campaign work. SPF/DKIM/DMARC is calendar time, not engineering time. |
| **D6** | Counsel's §7 UWG / lawful-basis position for the 538 Higher-Ed recipients. | The first production send. No engineering discharges this. |
| **D7** | Dedupe scope, undo retention, is hard-delete accepted? | §5.E. |
| **D8** | Notes repair — PITR restore or accept loss, once the census reports. | The Stage 0 repair migration. |
| **D9** | "NDA Executed → notification" — email, or in-app? There is **no in-app notification system** in this codebase. | Acceptance automation #5. |
| **D10** | Markdown as the stored body format constrains authoring to bold/italic/strike/lists/blockquote/link/hr. **No headings, tables, images or inline HTML.** | If whitepaper emails need a branded header block, that is a template slot, not body markdown. |

### Spikes

| # | Spike | Days | Why now |
|---|---|---|---|
| **S1** | 30-day durable `sleep` survives a Coolify redeploy | 0.5 | Highest-leverage half-day in the programme. Invalidates the sequence-semantics design if it fails; automation #4 would need a cron-driven `nextStepAt` poller instead. The messaging plan scheduled this *after* designing around it — that is backwards. |
| **S2** | Advisory-lock hold-time baseline on realistic data | 0.5 | `core/decorators/transaction-runner.ts:32` takes `pg_advisory_xact_lock(hashtextextended(companyId,0))` on every tenant transaction. Sets the budget for campaigns, list fills and merges. Agree a hard ≤200ms per-transaction ceiling. |
| **S3** | Linux conventions harness in Docker as a **pre-push hook** | 1.0 | `page-state-contract`, `background-tenant-boundary`, `i18n-key-resolution`, `di-boundaries` and `rest-openapi-coverage` build POSIX paths and scan **zero files on Windows**. Every cluster trips at least three. Otherwise CI is the discovery mechanism at one round-trip per discovery. |

### Census (C1) — run before Stage 0 lands

```sql
-- corrupted notes columns
select 'Contact' t, count(*) filter (where jsonb_typeof(notes)='string') corrupted,
                    count(*) filter (where notes is not null) with_notes from "Contact"
union all select 'Deal',         count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Deal"
union all select 'Organization', count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Organization"
union all select 'Lead',         count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Lead"
union all select 'Task',         count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Task"
union all select 'Service',      count(*) filter (where jsonb_typeof(notes)='string'),
                                 count(*) filter (where notes is not null) from "Service";

-- what the first automation sweep would fire
select a.name, a.enabled, a.schedule, a."nextRunAt", a."nextRunAt" < now() as overdue,
       array_agg(distinct s.kind) as actions
  from "Automation" a join "AutomationStep" s on s."automationId" = a.id
 where a."triggerKind" = 'schedule'
 group by a.id;
```

Dev-database result: **4 type-corrupted rows** (1 Contact, 2 Deal, 1 Task), **0 with destroyed
content** — the other non-NULL notes hold JSON `null`, not documents. So on dev, repair-forward
suffices. The client's 10,000+ records with real notes must be censused separately before D8
is settled.

The second query already returns one enabled scheduled automation with `nextRunAt` in the past.

---

## 4. Stage 0 — live defects. ~6.5 days, strictly ordered.

### Status — 26 Sep 2026

Six of the nine landed, in the order below. Commits on `merge/upstream-2026-09`.

| # | Item | Status | Commit |
|---|---|---|---|
| 0.1 | Red CI — automation notice in the preview census | **done** | `aaa9bc2e` |
| 0.2 | `appendNote` overwriting rich-text notes | **done** | `fa26e568` |
| 0.3 | `assignOwner` wiping co-owners and revoking access | **done** | `fa26e568` |
| 0.4 | Self-hosted admins cannot grant mailbox access | **done** | `2c4d7a0a` |
| 0.5 | AGPL core value-importing from `ee/`, and the fail-open | **done** | `85b4b600` |
| 0.6 | Web form message stored as a bare object | **done** | `2c4d7a0a` |
| 0.6 | Web form phone discarded | **blocked** | needs D11 |
| 0.7 | Lead value lost on conversion (`Deal.baseValue`) | **held** | needs D4 |
| 0.8 | `updateField` numeric coercion — the live crash | **done** | `2c4d7a0a` |
| 0.9 | Register `/api/cron/automations` | **deferred** | by design, see below |

**What changed beyond the fixes themselves.** `appendNote` now folds a raw string left by the
old behaviour back into the document on the next write, so records repair themselves on touch
and the repair migration is only needed for records no automation will write again. The two
regression tests that covered these actions passed either way — one asserted the bare string
the bug produced, the other seeded a record with nobody assigned — and now seed real rich text
and a colleague. `assignOwner` with no user configured fails instead of clearing every
assignee; `Prisma.deleteMany` is gone from that path entirely.

**C1 census, partial.** Run against the development database only: 4 type-corrupted rows
(1 Contact, 2 Deal, 1 Task), **0 with destroyed content** — the other non-NULL notes hold JSON
`null`, not documents. The client's database has not been censused, and must be before D8 is
settled.

**New decision, not in the original list.**

| # | Question | Gates |
|---|---|---|
| **D11** | A phone number captured by a web form has no honest home. `MessagingProvider` has exactly one phone-class member, `whatsapp`, so storing a contact-form number marks the contact WhatsApp-reachable. Add a `phone` provider, or drop the mapping from the admin UI? | The second half of 0.6. The UI offers the mapping today and silently discards it either way. |


These are shipped bugs on `merge/upstream-2026-09`, not new work.

| # | Item | Days | Evidence | Ordering constraint |
|---|---|---|---|---|
| **0.1** | **CI is red.** Register `automation-notice` in the preview census. | 0.5 | `components/emails/__tests__/preview-inventory.test.ts` — 17 templates on disk, census asserts 16. Verified 3–4 failures depending on host. | **First.** CI's "generated files committed" gate runs before `yarn test`; behind red CI no later PR's signal is trustworthy. Raise the 15s render-loop budget here, once. |
| **0.2** | **`appendNote` overwrites — data loss.** | 1.75 | `features/automation/run/prisma-automation-record-writer.ts:142-144` — `updateMany({ data: { notes: args.body } })`. Whole-column overwrite, and a raw string into a JSONB TipTap column. Same class of bug at the webform `notes: { message }` writer, repository line 120. | Code fix first; repair migration **only after D8**. |
| **0.3** | **`assignOwner` wipes co-owners.** | 1.0 | Same file, `:110` `deleteMany` then `:112` `createMany`. That join table is what `core/base/base-repository.ts:117-137` uses to scope `readOwn`, so it revokes record *access*, not just assignment. | Same file as 0.2 — one review. Default to add-owner; a `mode` flag only if the client wants replace semantics. |
| **0.4** | **Self-hosted admins cannot grant mailbox access.** | 0.5 | `role-modal.tsx:184` hides `Resource.inboxMessages` when `appMode === "self-hosted"` — a gate written for the ee `/inbox`, over-reaching onto the AGPL `/mail`. Seeded roles work; custom roles cannot be granted. | No edge. Land early because it is free. |
| **0.5** | **AGPL core value-imports from `ee/`.** | 1.0 | `features/event/event.service.ts:17` imports `carriesChangedFields, changedFieldsOf, matchesChangedFields` from `@/ee/routines/routine-event-filter`; native automation dispatch depends on them. Lines 9–10 are `import type` and are fine. | Write an independently-authored AGPL module; read the ee implementation only to understand behaviour. Add `agpl-dispatch-boundary.test.ts`. **Fold in the fail-open fix at `:156`** — one module, not two (see §7.B2). |
| **0.6** | **Webform phone discarded**, and delete `free-mail-domains.ts`. | 1.25 | `field-mapping.ts` produces `fields.phone`, the admin UI offers the mapping, nothing consumes it. | ⚠️ **Do not delete `free-mail-domains.ts`** — §5.F.4b depends on it. See §7.B5. |
| **0.7** | **Lead value lost on conversion** — `Deal.baseValue`. | 3.5 | `convert-lead-to-deal.interactor.ts:70` passes `services: []`. | **Held on D4.** Land it here, before anything reads totals — or close it and take the conversion dialog (§5.F.5e) instead. |
| **0.8** | **`updateField` numeric coercion.** | 0.5 | `automation-step-fields.tsx:107-111` coerces only `seconds`; `Deal.probability` is `Float?` and `UpdateFieldConfigSchema.value` accepts `string`, so `"50"` validates and reaches Prisma. **Live crash today.** | Pull forward from the authoring-UI phase — it gates the cron. |
| **0.9** | **Register `/api/cron/automations`.** | 0.75 | Absent from `vercel.json` crons **and** `docker/cron/entrypoint.sh`. The `schedule` trigger has never fired in any deployment. | 🔴 **Deferred to the end of Stage 2.** See below. |

### 🔴 The cron constraint

Registering that cron turns on `AutomationTriggerKind.schedule` **for the first time in any
environment**. Do not register it until *all* of:

1. `appendNote` (0.2) and `assignOwner` (0.3) fixed and the repair run;
2. run dedupe exists — `AutomationRun` has no unique index and no dedupe today;
3. the double-send guard exists — the delivery row written **before** the transport, keyed on
   `automationRunStepId`; `executeStep.maxRetries = 2` can otherwise re-send after the
   transport already accepted;
4. `updateField` numeric coercion fixed (0.8);
5. the C1 census of enabled schedule automations by action kind returns something you are
   willing to have fire;
6. `nextRunAt` re-stamped forward — the dev database already holds an enabled automation with
   `nextRunAt` in the past, and `AUTOMATION_SWEEP_LIMIT = 100`, so the first sweep would drain
   a backlog of first-ever executions at 100 per 5 minutes.

Ship it behind a kill switch (env var or per-company flag), not as a bare crontab line. Do not
land it in the same release as 0.2/0.3.

---

## 5. Stages 1–3 — the work

Two tracks. For one developer, interleave. For two, this is the split: they intersect only at
`core/di.ts`, the locale catalogues and the schema.

### Track A — storage, records, dedupe, parity

#### A. `core/storage/` foundation — 7–10d · *Increment B*

`storage-provider.ts` (interface + `StorageFailure` consts + `StorageError`, mirroring
`features/mailbox/sync/mailbox-transport.ts`), `storage-config.ts`, `s3-storage.provider.ts`,
`null-storage.provider.ts`, `storage-key.ts`, `upload-policy.ts`.

New deps `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Env group `STORAGE_*`; partial
configuration throws at module load (the `OAUTH_PROXY_URL` precedent); unconfigured is legal
and yields the null provider so an operator who does not want files still boots.

**Must live under `core/`** — `runtime-config-sources.test.ts` requires every top-level dir
reachable from the fumadocs source config to have a `COPY` in the Dockerfile runner, and
`core/` already has one.

**Interface must include `getObject()` streaming read** — §5.F.4a needs an authenticated proxy
route outside `/v1`, and `presignDownload` is not a substitute. See §7.B3.

Key layout `{companyId}/{scope}/{recordId}/{objectUuid}{ext}`, minted server-side; the user's
filename is stored in a DB column only. A row exists in `pending` before the object does.

Presigned URLs behind Coolify: SigV4 signs the `Host` header, so two clients share credentials
— an internal one (`STORAGE_ENDPOINT`) for `statObject`/`putObject`/`deleteObject`, and a
public one (`STORAGE_PUBLIC_ENDPOINT`) used **only** for presigning. `forcePathStyle: true` is
mandatory. Bucket CORS is required for the browser PUT. Clock skew >15 min breaks every
presign.

Safety posture: extension↔mime agreement, hard-refuse `text/html`, `image/svg+xml`, `*+xml`,
`application/x-*`; forced `attachment` disposition on every download except a tiny inline set;
size enforced three times. **No virus scanning** — ClamAV sidecar is +2d and the client signs
the posture either way. ⚠️ The allowlist must carve out email attachments (§7.B3).

Flow: `POST /v1/files/uploads` → browser PUT → `POST /v1/files/{id}/complete` (`statObject`
verifies) → `app/api/cron/sweep-pending-uploads` reaps `pending` rows >24h.

#### B. Dedupe — 33.5d (28.5 contacts + 5 organizations) · *Increment A (scan) + B (merge)*

**Decision: application-side blocking keys, no `pg_trgm`.** The extension would in fact
install everywhere today (all environments connect as superuser), but: a failed
`CREATE EXTENSION` fails the whole release, not the feature; every developer's
`prisma migrate dev` must reproduce it in the shadow database; and it does not solve the
client's problem, which is an identity-join problem, not a typo problem. Trigram on
`firstName||lastName` is the weakest signal and the highest false-positive generator.

Escape hatch documented: if live "find similar as you type" over 100k+ records is ever needed,
`pg_trgm` plus a GIN index on `ContactMatchKey.value` is an additive change with the matcher
unchanged.

**Models:** `DuplicateScan`, `DuplicateGroup`, `DuplicateGroupMember`, `DuplicateDismissal`,
`ContactMatchKey`, `ContactMergeRecord`. All carry `entityType` + nullable `organizationId`
from day one so organizations need no later migration.

**Blocking keys:** `emailLocalPart`, `emailDomainSurname`, `phoneLast7`, `nameKey`,
`nameSoundKey`, `organizationSurname`. Exact email is deliberately *not* a key —
`ContactIdentifier`'s `@@unique([companyId, channelClass, value])` plus `validate-identifiers`
and `check-channel-conflict` already make it impossible for two contacts to own one address,
so every interesting signal is inexact. Say this to the client explicitly.

Soundex/metaphone rejected: English-only, poor on German/French/Italian surnames, and this
product ships five locales. Use a locale-neutral consonant-skeleton fold (~120 lines, no new
dependency).

**Scan** is a workflow — `rebuildMatchKeys` (500/page) → `generateCandidates` (buckets >25
skipped and recorded, not exploded) → `scorePairs` (union-find into clusters, dismissed pairs
dropped first) → `finishScan`. Keys are recomputed on scan, not by an event listener, so the
import hot path is untouched; staleness costs recall, never correctness.

**Dismissal needs its own table.** A group is keyed by a fingerprint over its member set, so a
dismissed {A,B} would reappear as {A,B,C}. Dismissal is a fact about a *pair*.

**Merge:** one transaction per merge, never per batch — forced by the advisory lock. Losers
capped at 9 to stay inside the 30s `BULK_WRITE_TRANSACTION` timeout. Ordered: load under
`accessWhere` (a record invisible under `readOwn` returns `failNotFound` — merging must not be
a back door) → conflict checks returned not thrown → **snapshot written before any delete** →
identifiers re-parented honouring *both* uniques → relations de-duplicated then re-parented →
`Lead.contactId` re-parented `CompanyWide` (under `readOwn`, `accessWhere("lead")` would
silently null another user's lead via `onDelete: SetNull`) → custom fields resolved → scalars →
losers deleted → group marked merged → events published.

**Zero `ee/` changes**, and for a verified reason: `MessagingThreadParticipant` has no
`contactId`; `ee/messaging/persistence/prisma-messaging.repository.ts:1601-1603` hydrates
`message.sender.contact` at read time from a `ContactIdentifier → contact` lookup. Re-parenting
`ContactIdentifier` re-parents the entire inbox and timeline for free.

Deliberately **not** rewritten: `AuditLog.entityId` (no FK, no `entityType`; rewriting would
falsify history — write one `contact.merged` entry on the winner instead), `AutomationRun`,
and saved `DataView`/`P13n`/`Widget`/`Automation` filter JSON (a filter naming a dead id
degrades to "matches nothing", which is visible and correct).

**Workbench** is a new surface under `contacts/duplicates/`, not a mass action —
`MAX_SELECTION_SIZE = 100` caps every selection, and a merge is an operation on a *cluster with
a chosen winner and per-field picks*, which the mass-action contract has no vocabulary for.

Also: import-time `review` strategy turning `duplicate-plan.ts:98-101`'s ambiguous-key bail
into a queued group; opt-in lead-level dedupe and a fuzzy capture ladder for the client's
lead-magnet scenario (tiers 3–4 attach *and* open a group — never silently merge on a fuzzy
signal); and a one-line fix making `resolveOrganizationUnscoped` case-insensitive.

⚠️ **Open technical objection.** The review argues hard-delete-with-JSON-snapshot undo is the
wrong call: a bespoke snapshot format must stay correct as the schema grows ~25 models over 12
months, it will rot silently, and you find out only when someone needs the undo. A
`mergedIntoId` soft-delete pointer is reversible *by construction*. Raise this before 16d of
merge machinery is built. Counter-argument: `Contact` has no soft-delete column, and adding one
touches every `accessWhere` consumer, every count, every grouping query and
`resourceOwnWhereMap` — exactly the edit CLAUDE.md warns against.

#### C. Record files (M10) — 5–7d · *Increment B*

`RecordFile` model, upload/list/download/delete, and a **Files tab** on contact / organization
/ deal — extending the `DetailPanel` union at `components/entity-detail/entity-detail-layout.tsx:62`,
following the M7 precedent where that file gained an optional `emailsPanel`. Each new protected
page needs a sibling `loading.tsx` and bumps `page-state-contract.test.ts:64`.

#### D. Documents + eSignature (M11) — 2–3d stored PDFs, 7–11d with signing · *Increment B*

Document model with status tracking, a Documents tab, and a provider behind an interface so it
is swappable. Signature callbacks go to `app/api/webhooks/` (outside `/v1`, not OpenAPI-scanned);
copy the HMAC pattern from `app/api/webhooks/lemonsqueezy/route.ts`. **Held on D2** — if they
already pay for DocuSign this is connect-and-go; if not, signing can stay in DocuSign and the
CRM just stores the executed PDF.

#### E. Invoices (M12) — 12–18d Tier 2 per D-6 · *Increment B*

Reuses the line-item half, which already exists: `Service` + `ServiceDeal`
(`@@unique([serviceId, dealId])` with `quantity`) drives `Deal.totalValue` at
`features/deals/prisma-deal.repository.ts:1051-1052`, and the terminology presets already let
a workspace rename Services to "Products".

Missing and to be built: per-line currency (currency is workspace-wide on `Company`; `Deal` has
no currency column, though `intl.store.ts:81` `formatCurrency` already accepts a per-call
override), tax/VAT, discount, issue/due dates, payment status, invoice numbering with a row
lock, billing address, PDF generation through `core/storage/`.

⚠️ **Billing identity does not exist on either side.** `Organization` has only
`id, name, companyId, notes, createdAt, updatedAt` — no address, no country, no VAT id. And
`Company` has **no `name` column at all**. An invoice needs a seller legal name/address/VAT and
a buyer address. Neither exists.

⚠️ No Chromium in the Dockerfile runner (`node:24-bookworm-slim`, only
`openssl ca-certificates git`) — rules out Puppeteer/Playwright PDF rendering without a large
apt payload. Use `@react-pdf/renderer`.

#### F. Parity gaps — 57d (MUST 29 + SHOULD 28)

**MUST — 29d**

| # | Item | Days | Notes |
|---|---|---|---|
| 5g | `lead.*` outbound webhooks + 3 `.openapi.ts` | 1 | `WEBHOOK_EVENT_COUNT` is *derived* (`WEBHOOK_EVENTS.length`) — no census to bump. The real gate is `features/webhook/__tests__/webhook-openapi.test.ts:60`. |
| 4b | Organization-level email history | 2 | **Best value-per-day in the programme** against a named client ask. `MessagingThread` has `linkedDealId` but organizations have no link — derive via participant → `ContactIdentifier` → contact → organization. Needs `free-mail-domains.ts` to exclude gmail/outlook, or it becomes "every Gmail user in the tenant". |
| 5c | Web form submissions inbox | 4 | `markSubmissionFailedUnscoped` currently writes into a black hole. A lead magnet that silently drops submissions is worse than one that is down. |
| 5a | Web form mapping: custom fields, `value`, UTM, consent | 4 | Direct blocker for the client's "same buyers, slightly different information" scenario — magnet-specific answers land nowhere today. |
| 1 | Relation custom fields (lean: no grouping, no CSV import) | 9 | Per D-4. Touches 7 hot repository files. Land in one branch, rebase immediately, **never in parallel with 5a** — both touch `prisma-lead.repository.ts`. |
| 4a | Mailbox attachments | 9 | **Blocked on A.** Needs `getObject()` streaming and an allowlist carve-out. |

**SHOULD — 28d**

| # | Item | Days |
|---|---|---|
| 4c | Sent-sync plumbing fixes (already largely implemented — far cheaper than PRD 09 implied) | 2.5 |
| 5d | Editable lead owner/contact/organization (all `EntityDetailStaticField` today) | 2 |
| 5e | Lead conversion dialog (interactor supports pipeline/stage/name/close-date/probability; UI sends `{ id }`) | 2 |
| 5f | Leads in global search (`global-search.interactor.ts:19` has an explicit `Exclude<EntityType, "lead">`) | 2.5 |
| 3 | Days-in-stage bar (+0.5 backfill) — `DealStageHistory` exists and *is* populated; no endpoint reads it | 4 |
| 6 | Shared saved views — `DataView` has `userId` required on all nine read/write sites and no visibility field | 5 |
| 2 | Week calendar over `Task.dueAt` — no calendar grid exists anywhere; `ee/calendar/` is off-limits and `ConnectedAccount`-bound | 6 |
| 5h | Pipedrive lead import (`scripts/migrate-pipedrive/` has no lead arm) | 3.5 |
| 7 | Second-pipeline configuration for post-sale delivery | 0.5 |

**OUT OF SCOPE — declined in writing**

- **5i lead email timeline.** `ACTIVITY_FILTER_FIELD_BY_ENTITY_TYPE` is already
  `Partial<Record<…>>` with no `lead`, `NamedModel` excludes it, and `LEAD_*` events map to
  `null`. Adding it means editing `ee/` and would be a third agreed exception — exactly what
  CLAUDE.md's "never add a wrong FilterFieldKey to satisfy the type" forbids. Automations #1
  and #2 are lead-scoped, so this is visible to the client on day one.
- **Projects as an entity** (30–40d). "Projects" already ships as a `deal` terminology preset
  with full copy in all five catalogues. The configuration answer — a second pipeline with
  `StageKind` — costs 0.5d. Ratio is roughly 60:1. Do not sell the `service → product` preset
  as an *invoicing* answer, though; it fails the first time they ask for an invoice number.
- **Calendar sync** (PRD 09 §10). `ee/`-bound. Decline explicitly rather than drop silently.

**OPTIONAL — quote separately**

Relation-field grouping +1.5 · relation CSV import +2 · drag-to-reschedule +2 · **OAuth
Gmail/Graph 10–12d + 4–8 weeks provider verification** · drafts 4 / outbox 5 / folders 3 /
labels 3 / follow-up 2 · lead assignment rules 5 (+2 territory) · lead MCP tools 2 · ClamAV +2.

---

### Track B — messaging, campaigns, automations

#### G. `features/messaging-send/` — 12.5d · *Increment C*

⚠️ **Freeze `messaging-send.contract.ts` on day 1 — budget 2.5d, not 1.** Four concrete gaps
stand between this layer and its campaign consumer (§7.B4): batched `SuppressionRegistry`
(the campaign path needs one call per ≤100 addresses, not per recipient), an `idempotencyKey`
through the transport chain, `MessageDelivery.campaignId` + a `dedupeKey` unique, and a
`SuppressionReason` enum mismatch. **One agreed `dedupeKey` semantics for both consumers** —
today the two plans use different keys against the same layer.

- **Honest `EmailService`.** Replace the `NODE_ENV !== "production"` short-circuit (which
  returns `true` without sending) with an explicit `EMAIL_TRANSPORT=console` transport
  reporting through `core/errors/`, not `console`. Delete the
  `["features/email/email.service.ts", ["log"]]` entry from `runtime-console.test.ts:10` in the
  same commit — it is an exact census. **Do not widen `send()`'s return type**: it has 16 call
  sites, 7 under `ee/`, and `ee/lifecycle/send-legal-document-notices.interactor.ts:150` reads
  the boolean. Add `deliver(): Promise<EmailReceipt>` alongside and have `send()` delegate.
  Stop discarding Resend's message id at `resend.transport.ts:14`.
  ⚠️ **Release note required**: any environment relying on the silent non-production no-op
  starts sending real mail.
- **Transport headers.** `EmailMessage` has no `headers` field at all today; both transports
  must forward `List-Unsubscribe` and `List-Unsubscribe-Post` verbatim.
- **`MessageTemplate`** model + slice + REST.
- **Merge-field vocabulary + resolver.** Mirror the `getFilterableFields()` allowlist pattern.
  An unknown key is a **hard failure, never a passthrough**. A missing value with no declared
  default is a **failure, not an empty string** — that is what stops "Hi ," reaching the
  client's list. Values HTML-escaped. Add an explicit `UNMERGEABLE_FIELDS` deny-set *on top of*
  the allowlist, plus a test asserting a known-sensitive key is absent, because the vocabulary
  is derived from DTO schemas and a DTO could later gain a sensitive field.
- **Markdown → email-safe HTML.** Store markdown, render at send time, never store HTML.
  `components/editor/email-markdown-editor.tsx` already exists and stores markdown;
  `markdown-it`, `sanitize-html`, `dompurify` and `tiptap-markdown` are already dependencies.
  TipTap's own HTML is not email-safe. One new template (`campaign-message.tsx`) keeps the
  `preview-inventory` census at one addition rather than one per client email.
- **Template preview** against a real record.

⚠️ **Format the output through `core/stores/intl.store.ts`, not `i18n/formatters.tsx`.** The
latter is 8 lines of rich-text chunk renderers (`br`, `bold`, `italic`, `underline`) and cannot
format a date, number or currency. CLAUDE.md is wrong about this; see §9.

#### H. Suppression + unsubscribe — 4.5d · *Increment C*

`MessageSuppression` + `UnsubscribeToken` (store the sha256, never the token). A **public,
unauthenticated, rate-limited** unsubscribe route outside `/v1` — RFC 8058 one-click requires
POST to succeed with no cookie and no CSRF token, and getting this wrong means Gmail's
unsubscribe button silently fails, which is worse for deliverability than no header at all.
Enforcement at send time, **only for `MessageTemplateKind.marketing`** — an internal
notification must not carry an unsubscribe header or be suppressed because the owner
unsubscribed from marketing. Company-settings suppression list.

**Not cuttable.** This is what makes the send legal.

#### I. Delivery tracking — 4.5d · *Increment C*

`MessageDelivery` + `MessageDeliveryEvent` with `@@unique([deliveryId, kind, occurredAt])` for
webhook idempotency. `app/api/webhooks/resend/` — ⚠️ **Resend signs with Svix**
(`svix-id`/`svix-timestamp`/`svix-signature`, base64 HMAC over `${id}.${timestamp}.${body}`),
not the plain hex scheme LemonSqueezy uses, so the structure copies but `verifyHmacSha256Hex`
does not. Bounce/complaint writes a suppression row.

**Under `EMAIL_TRANSPORT=smtp` there is no delivery tracking at all.** Nodemailer reports
envelope acceptance only — no bounce callback, no delivered event, no complaint feed. Status
sits at `sent` forever and suppression is populated only by explicit unsubscribes and manual
entries. Recommend Resend for the client's deployment.

#### J. Sender identity — 3.0d · *Increment C*

Per-company/per-user From and Reply-To. **Domain verification is not optional** — refuse an
unverified custom sender at send time rather than silently falling back, because a silent
fallback is how a sequence quietly lands in spam.

⚠️ The "send via the user's own SMTP needs a brand-new model, ~6d" framing is **wrong**:
`features/mailbox` already creates `ConnectedAccount` rows itself, `MailboxCredential` already
carries `smtpHost`/`smtpPort`/`smtpSecure`, and `connect-mailbox.interactor.ts:60-76` already
validates and SSRF-guards them. The real gap is the cold-compose path — `SendReplyInteractor`
requires a `messagingThreadId` — which is genuinely missing but much smaller.

#### K. Automation `sendEmail` — 4.5d · *Increment C*

`SendEmailConfigSchema` is `{ to: z.email(), subject, body }` — a literal address and static
strings — and `crm-automation-action-executor.ts:81` dispatches `runSendEmail(args.config)`
without `context`, so it structurally cannot reach the triggering record.

Pass `context`; widen the recipient to a discriminated union (literal / record contact / record
owner) behind a `z.preprocess` lift so existing saved `AutomationStep.config` rows keep working
without a data migration; add a resolver walking deal → `DealContact` → `ContactIdentifier`
(`channelClass: "email"` as a literal, per the AGPL-clean precedent at
`prisma-mailbox.repository.ts:413`), lead → `Lead.contactId`, contact directly, and owner via
the user join. A null recipient **fails the step loudly** — the run-step machinery already
marks it failed and breaks the loop.

Route through `messaging-send`; retire `CrmAutomationEmailSender`. Thread a locale through —
`crm-automation-email-sender.ts:14` hardcodes `DEFAULT_LOCALE`.

#### L. Conditions + changedFields — 6.0d · *Increment C*

The back end already exists and is good — the matcher reuses the entire data-view filter
language including deal `stageId`, `pipelineId` and custom fields, and both keys persist. But
`automation-modal.tsx:72-79` sends `{id?, name, triggerKind, entityType, schedule, steps}` and
nothing else, there is no conditions UI, and there is no automations REST API or `.openapi.ts`
anywhere. They are settable only by writing JSON into the column.

Copy `routine-configuration-pane.tsx` — it is **AGPL under `app/`**, not ee code, and may be
copied freely. `getRoutineFilterFieldsAction` shows the pattern; no new interactor is needed.
Write a core `automation-change-fields.ts` and **add a `lead` entry**, which the ee version
lacks because leads are an automation trigger entity but not a routine one.

Real cost: `FilterAccordion`/`FormAutocomplete` are form-context components and
`automation-modal.tsx` is `useState`-based. Convert it to a MobX store (~2 of the 6 days) —
which also fixes the `key={...-${index}}` remount bug at `:166`.

Stage-transition semantics: `changedFields: ["stageId"]` + `conditions: [stageId equals X]`
fires exactly when the stage changed *and* the deal is now in that stage. Pin it with a
database test — it is the most load-bearing behaviour in automations #3, #4 and #6.

#### M. Sequence semantics — 4.0d · *Increment C*

Conditions are evaluated once before the step loop and never re-checked; `cancelled` exists in
the enum and nothing sets it; there is no run dedupe and no unique index on `AutomationRun`.

Re-evaluate after every *delay* (not after every step — that would fight the automation's own
writes), set `cancelled`, exit on record change, and add a `dedupeKey` with
`@@unique([companyId, automationId, dedupeKey])` cleared on terminal states. Without dedupe,
every subsequent deal update starts a *parallel* sequence and the prospect gets email 4 several
times.

⚠️ **Held on S1.** If a 30-day `sleep` does not survive a Coolify redeploy, this needs a
cron-driven `nextStepAt` poller instead — a different design, ~10d of rework.

⚠️ The workflow **body** may not value-import `generated/prisma` — it runs in a `vm` with no
`require`. All logic lives inside `"use step"` functions.

#### N. Authoring UI — 5.5d · *Increment C*

Every config field is a bare text `<Input>` today; `createTask` exposes only `name`,
`createDeal` only `name`, and `assignOwner`/`moveStage` require pasting raw UUIDs. Replace with
a per-kind field descriptor and real pickers (user select, pipeline+stage cascade, duration
picker, `EmailMarkdownEditor` with a merge-field menu). Extend `updateField` to write custom
fields with type coercion — the `WRITABLE_SCALARS` allowlist is 2–3 scalars per entity and
excludes all custom fields.

Do **not** widen `WRITABLE_SCALARS` for deal `stageId`/`pipelineId` — `moveStage` owns that,
and a raw write bypasses `DealStageHistory`.

#### O. Chaining + timeline — 3.0d · *lowest priority, first cut candidate*

`AUTOMATION_MAX_CAUSATION_DEPTH = 1` means automations can never chain. Lift to 3 with a
`visitedAutomationIds` set (a depth counter alone does not kill A→B→A) plus the dedupe key.
**Held on client confirmation that chaining is wanted.**

Timeline logging needs five `DomainEvent` members, one per entity type — `audit-entity-type.ts`
is keyed by *event*, not payload, and the single-event alternative would require editing an
`ee/` call site.

#### P. Lists, audience, campaigns — 57d · *Increment C*

**Lists (9d).** `ContactList` + `ContactListMember` with `@@unique([listId, contactId])`.
`CustomColumnType` has no `multiSelect`, so a custom column can model "which single list", never
membership in several — the PRD's suggested fallback does not exist. `DataView` is a per-user
private saved filter, not a membership set. Adding 5,000 contacts to a list cannot go through
`MAX_SELECTION_SIZE = 100`; it needs a filter-scoped fill workflow.

**Audience (7d).** `features/audience/` with its own query path per D-1. The client's predicate
— *contact on list X AND the contact's organization's industry is Higher Education* — is
Contact → ContactOrganization → Organization → CustomFieldValue, three hops past the root; the
shared builder does one, from a fixed 41-entry map, flat and AND-only. Resolve each contact's
address via `ContactIdentifier` and exclude contacts with none — contacts have no `email`
column and identifiers are searchable but not filterable.

⚠️ **The DSL contradicts the client's annotation.** They wrote *"create complicated lists based
on any field in the CRM"*. The plan excludes `OR`, `NOT`, nesting, deal/lead/task/service
predicates, date-range custom columns, numeric comparison and free-text search. Their actual
`CDI Targets` filter is expressible; the sentence after it is not. **Get this in front of them
before the resolver is written.**

**Selection (4d).** A parallel filter-scoped path. Do not raise the cap; do not bypass it.

**Campaigns (8d) + send workflow (6d) + UI (9d) + retention/docs (5.5d).** `Campaign` +
`CampaignRecipient` modelled on `AutomationRun`/`AutomationRunStep`. Per-recipient idempotency
so a resumed run never double-sends. The workflow uses the SDK's documented
chunk→`allSettled`→`sleep` pattern; pass a campaign id and load recipients **inside** a step —
arguments are serialized into the event log, so 538 records must never be an argument.

**Extract one `features/bulk-job/` primitive** — lists fill, campaign send and duplicate scan
all need the same thing (take a definition not ids, keyset page, write in batches, sleep between
pages to release the advisory lock, record a job marker, confirm against a staleness-checked
count). Saves ~2d and removes three chances to get the lock pacing wrong.

**GDPR.** Tracking opt-in defaults to off — pixels and link rewriting are terminal-equipment
access under ePrivacy/§25 TDDDG. Per-batch suppression. Retention redaction. Preview capped at
25 rows and never exported; the resolver composes `accessWhere` so a `readOwn` operator cannot
preview or mail someone else's contacts.

⚠️ **§7 UWG requires prior express consent for advertising email to German recipients, and the
existing-customer exemption almost certainly does not cover Higher-Ed prospects. The lawful
basis for this specific send may simply not exist**, and no engineering discharges that.
Recording a lawful-basis field satisfies Art. 5(2)/30 accountability; it does not create
legality. Resend is US-based, so 538 EU academic addresses is a Chapter V transfer needing a
DPA + SCCs + a RoPA entry — or an EU SMTP path, which costs all delivery tracking.

---

## 6. Critical path

```
D5/D6 → contract freeze → EmailService receipt → MessageTemplate → merge fields
      → markdown render → suppression/unsubscribe → campaign slice (← lists → audience)
      → send workflow → campaign UI → compliance gate → first 538 send
```

**~55–60 engineer-days before the client's headline ask can go to production**, and
irreducible by headcount because the chain is serial. It assumes the DNS/domain/ESP work —
excluded from every estimate — runs in parallel and lands first.

**Where the programme stalls, by blast radius:**

1. **Storage slips → ~40d blocked** (record files, documents, invoices, mailbox attachments).
   Highest-variance item: SigV4 + Traefik + CORS + Coolify, on a stack that has never had
   object storage. Budget p80 at 3–4d shakeout with a real tail risk.
2. **`messaging-send` Phase 1 slips → the entire send path stalls** — campaigns, automation
   email, document and invoice mail. The +3d fallback (a thin sender with a trivial substituter
   and a hardcoded footer) must not become the plan of record; a hand-rolled unsubscribe is
   exactly where compliance goes wrong.
3. **S1 fails → ~10d rework** and automation #4 needs a different mechanism.
4. **Any unanswered product decision → its whole block.** ~25 open decisions; at least 8 are
   schedule-blocking.
5. **The Linux CI harness** is a throughput constraint, not a dependency — expect at least one
   CI round-trip per `preview-inventory` touch, and it is touched four times.

**Genuine parallel starters, day 1, near-zero contention:** storage · dedupe scan engine ·
days-in-stage bar (4d, no schema, cheapest visible win) · lead webhooks (1d) · org email history
(2d) · second-pipeline configuration (0.5d) · lead conversion dialog · the contract negotiation.

**Bad parallel choices:** anything touching `core/di.ts`, `prisma/schema.prisma`, the five
locale catalogues, `base-repository.ts`, the `Resource` enum, `page-state-contract.test.ts`, or
`prisma-lead.repository.ts` simultaneously.

---

## 7. Cross-plan reconciliation

### A. Corrections carried into this plan

| # | Correction |
|---|---|
| A1 | The messaging cluster scheduled the automation cron in *its* Phase 0 and contains no fix for `appendNote` or `assignOwner`. **Struck** — §4's ordering wins unconditionally. |
| A2 | `i18n/formatters.tsx` is 8 lines of rich-text chunk renderers and cannot format a date, number or currency. The boundary is `core/stores/intl.store.ts`; `hydration-safe-intl.test.ts:10-11` pins the member regex. Three of the six plans had this wrong, from CLAUDE.md. |
| A3 | `tests/conventions/open-core-license.test.ts` does not exist. Nor does `ee/LICENSE.md`. There are **92** convention tests, not 76/77. The AGPL→ee direction is **not** globally enforced. |
| A4 | Adding any `FilterFieldKey` member forces a fill in `RELATION_FIELD_MAPPING` (`base-query-builder.ts:66`, `Record<FilterFieldKey, string>`, exhaustive, 41 entries). **Two parity tasks therefore edit the file D-1 declares untouched.** Reconcile before either lands. |
| A5 | Arithmetic: the parity rollup's MUST column sums to 29 not 24, and SHOULD to 28 not 27. The campaigns plan's section estimates (43) and task table (57) differ by 14 days; the task table is authoritative. |

### B. Contradictions resolved

| # | Conflict | Resolution |
|---|---|---|
| B2 | Two plans write two different AGPL replacements for the same three ee functions on the same import line. | One module. Take the more complete version (it also handles `matchesChangedFields` and adds the guard test) and fold the fail-open fix into it. §4 item 0.5. |
| B3 | The storage interface (`presignUpload`/`presignDownload`/`statObject`/`putObject`/`deleteObject`) does not provide what mailbox attachments need: a `getObject()` streaming read for an authenticated proxy route outside `/v1`, and a content-type policy that does not hard-refuse `text/html`/`*+xml` — which real mail routinely carries. | Settle **one** interface before storage is written. Adding it after means a second pass through `core/di.ts` and `core/storage/`. |
| B4 | The campaign plan consumes four abstracts the messaging plan does not build. | Contract freeze at 2.5d, blocking, not a day-1 parallel task. |
| B5 | One plan deletes `free-mail-domains.ts`; another depends on it for organization email history (a MUST). | **Do not delete it.** |
| B11 | A proposed `cron-schedule-parity` test would immediately fail three other plans' cron routes. | Adopt the test; add +0.25d to each affected route for dual registration. |

### C. Census reconciliation

| Census | Now | Final if everything ships |
|---|---|---|
| `page-state-contract.test.ts:64` protected loaders | **38** | **44–46**. Four workstreams bump it, each assuming a stale predecessor. It is derived from the filesystem — make it a merge-queue check, not a plan-time constant. |
| `preview-inventory` templates / cases / send sites | **16 / 16 / 15** (17 on disk — currently RED) | ~18/18/17, or 17/17/16 if `automation-notice.tsx` is retired. Touched 4+ times. |
| `renderCount` | **68** | 73–74. Derive it, do not guess. |
| `WEBHOOK_EVENT_COUNT` | derived | **no bump ever.** The real gate is `webhook-openapi.test.ts:60`. |
| `Resource` ↔ `RoleModal.resources.*` (exact equality) | 14 | 16 (`invoices`, `campaigns`) — 4 migrations, 2 enum-only. |
| `DomainEvent` ↔ `Common.events.*` (exact equality, both directions) | 55 | **~68–72.** Not previously tracked by any plan. `audit-entity-type.ts` is exhaustive, so every new member is a compile error until mapped, and each costs 5 catalogue entries. |
| ee MCP schema census | `{ uuid: 90, "date-time": 3, email: 6, uri: 4 }` | **unchanged** — *if* no new MCP tools and the relation field types as `z.string()`. ⚠️ Widening the shared `CustomFieldValueSchema` with a `z.uuid()` target could bump `uuid` **silently**. Verify before it lands. |

### D. Shared-file collisions — highest risk

`prisma/schema.prisma` (5 plans, ~25 models; `Company` gains ~15 back-relations on top of 80+
— the worst conflict surface in the repo; one owner for `model Company`, everyone else appends
at EOF) · `core/di.ts` (5 plans, ~60 factories; append one contiguous block per plan — it is the
one file allowed comments) · the five locale catalogues (key order is eslint-enforced, so
additions land in the same alphabetical neighbourhoods across five files; land locale changes as
the final commit of each branch) · `role-modal.tsx` (3 plans, two within 3 lines of each other)
· `core/openapi/openapi-spec.ts` (~41 imports) · `entity-detail-layout.tsx` (×2) ·
`entity-detail-page-view.tsx` (×3) · `use-filter-select-items.tsx` (×3) ·
`docker/cron/entrypoint.sh` (×4, single heredoc) · `vercel.json` (×3+).

---

## 8. Risks

| # | Risk | Severity |
|---|---|---|
| **R1** | ~30% of scope is gated on client answers, quoted as one number. A single figure across that optionality is a range in disguise. | **High** |
| **R2** | First-ever object storage in a self-hosted Coolify stack: new stateful service, new volume that must enter the backup set, SigV4 host-signing, mandatory CORS, Traefik body limits, clock skew. Blocks ~40d. Plus no virus scanning. | **High** |
| **R3** | The advisory lock versus every bulk path, and **nobody has measured it**. The campaign design handles it well; the merge design ("one transaction per merge") does not, and the `ContactMatchKey` rebuild is a full rewrite over 10,000+ rows under the same lock. S2 sets the budget. | **High** |
| **R4** | 30-day durable `sleep` unproven, and was scheduled to be validated *after* the design that depends on it. Moved to week 0. | **High** |
| **R5** | Double-send from step retries, plus two incompatible `dedupeKey` semantics against one shared layer. Fix in the contract, before either consumer is built. | **High** |
| **R6** | GDPR / §7 UWG. Lawful basis may not exist; deliverability damage to transactional mail if marketing shares a domain; Chapter V transfer. The compliance gate must require a **named client signatory**, which an engineer cannot satisfy. | **High** |
| **R7** | `Deal.baseValue` into a derivation 13 references read — and a converted lead with no service lines yields a €50,000 deal and a **zero-line, zero-total invoice**. Either `baseValue` becomes a synthetic invoice line, or invoice creation refuses/warns. Decide before invoices and before merge fields. | **High** |
| **R8** | **Rebase pressure is what the programme is most wrong about.** ~870 upstream commits over 12 months while touching every shared file repeatedly. CLAUDE.md's additive-files rule and this scope are incompatible. Choose: pin to a known-good SHA with quarterly catch-up merges (3–5d each), or carry a continuous 12–20% tax and put it in the number. | **High** |
| **R9** | Windows/Linux harness divergence — five convention tests scan zero files locally. S3 makes it a hook, not a discipline. | **Medium** |
| **R10** | Workflow event-log growth with no retention job, on a single self-hosted Postgres. | **Medium** |
| **R11** | CI has been red since `229e58b7` and stayed red through the shipping of a whole feature. The 0.5d fix is trivial; the cultural gate is the thing to install. | **Medium** |
| **R12** | Bus factor of one on a client's production CRM for 12–17 months. Not a technical risk, and the largest one in the document. | **High** |

### Over-engineered, in the reviewer's judgement

Delivery tracking beyond bounce handling, the sender-identity phase, and chaining+timeline
(~10.5d) for a client whose ask was "bulk personalised email to a filtered list" · campaign
pause/resume/stuck-sweep/retry-rearm UI (excellent for 100k sends; a 538-recipient run needs
cancel + retry-failed) · Tier 2 invoicing for a tab whose usage is unknown · relation custom
fields at full scope when the lean 9d carries the client value.

---

## 9. Gaps nobody owns

| # | Gap | Cost |
|---|---|---|
| **F1** | **Porting the client's 37 live automations.** The engine is built and validated against 6 named ones; the other 31 are unowned, and `scripts/migrate-pipedrive/` has no automation arm. At the PRD's own rate: **10–20d**. |
| **F2** | **Migration covers deals/contacts/orgs and leads. Nothing else.** No list membership (the `CDI Target` values the whole campaigns cluster consumes), no files, documents, activities, notes, email history, or the 229 duplicate groups. **Lists and dedupe both ship empty on day one.** ~8–12d. |
| **F3** | The audience DSL contradicts the client's "any field in the CRM" annotation. Reconcile before building. |
| **F4** | Calendar sync — ee-bound, must be declined in writing. |
| **F5** | OAuth deprecation — existential, and sitting in the OPTIONAL column. Answer D1 first. |
| **F6** | In-app notifications — no system exists; D9. |
| **F7** | Virus scanning (+2d) and a storage quota hook, which the interface lacks. |
| **F8** | `RecordFile` carries a `leadId` FK with no UI. Decide deliberately. |
| **F10** | **CLAUDE.md is wrong in eight places** and nobody owns fixing it: the non-existent licence test and `ee/LICENSE.md`; the convention-test count (92, not 76/77); `i18n/formatters.tsx` as the formatting boundary; "the `Deals` namespace is currently empty" (it is *absent* from all five catalogues); `core/di.ts` line count (2,301, not 1,877); `features/deals` file count (55, not 54); and an ee census that omits `"date-time": 3`. **One PR, half a day, and it stops the next contributor inheriting the same wrong facts.** |

---

## 10. Quality gates

**Gate 0 — before any feature work.** CI green on Linux three runs consecutively, and
never-merge-behind-red as policy · `yarn conventions:check` in Docker via a pre-push hook, with
a demonstrated catch of a deliberate violation of each of the five Windows-vacuous tests ·
PG16 **and** PG17 migration verification demonstrated locally · C1 census run and answered ·
D1–D10 answered in writing · S1 and S2 complete · advisory-lock p50/p95 baselined with an
agreed budget.

**Gate Stage 0.** `appendNote` and `assignOwner` merged; the repair migration rehearsed against
a snapshot restore before production · regression tests that would have caught the originals
(seed a real TipTap document; seed **two** existing assignees — a zero-assignee fixture passes
either way) · the cron **not** registered, and a written census of what the first sweep would
fire.

**Gate storage.** A file uploads and downloads end-to-end through the **real Coolify deployment
with Traefik in front** · browser presigned PUT proven from `BASE_URL` (CORS) · download forces
`attachment` · the cap enforced at all three points · a mistyped upload (`.html` declared
`image/png`) refused · `minio-data` in the documented backup set with **one rehearsed restore**
· pending-upload sweep deletes an orphan · the client has signed the no-AV posture or ClamAV is
funded.

**Gate record files.** Deleting a contact removes rows *and* objects, proven with a bucket
listing · a `readOwn` user cannot see another owner's files · the Files tab works at phone width.

**Gate messaging Phase 1.** Contract frozen and **both** consumers compile against it with
**one** `dedupeKey` semantics · unknown merge key is a hard failure · a `{{user.passwordHash}}`
probe returns `unknownKey` · an XSS payload in a contact name renders escaped · currency and
dates render through `intl.store.ts` · a real email delivered to a real inbox from staging, with
raw source showing inline styles and no `<style>` block · `EMAIL_TRANSPORT` verified in **every**
environment so nobody starts sending by accident.

**Gate messaging Phase 2 — the compliance gate.** One-click unsubscribe works
**unauthenticated** from Gmail's own UI against a real message · suppression consulted **per
batch**, proven by a test that suppresses mid-run · a rendered message missing
`List-Unsubscribe` is **refused**, with a test · separate sending domain live with
SPF/DKIM/DMARC, transactional mail on a different domain/key · named client signatory for
lawful basis on record · counsel's §7 UWG position on file.

**Gate campaigns — before the first production send.** A simulated crash between
transport-accept and the database write produces **zero** double-sends · cancel takes effect
within one batch · advisory-lock wait measured during a full 538-run, inside budget, with
interactive writes proven responsive · **a dry run to a 20-address internal seed list, reviewed
by the client, before the 538**.

**Gate dedupe.** Merge proven reversible for every affected table on a restored copy of
production data · per-merge lock hold time measured; a 229-merge batch does not stall
interactive writes · **precision/recall of the blocking keys reported against the client's
actual 229 groups** — if the scan finds 150 or 400, the keys are wrong, and that must be known
*before* the merge workbench ships · hard delete gated behind explicit confirmation with the
snapshot written in the same transaction.

**Standing, every phase.** `yarn lint` · `yarn typecheck` · **all convention tests on Linux** ·
full vitest · five-locale parity · `openapi:generate` + `raw-docs:generate` regenerated and
committed · `yarn build` · PG16 **and** PG17 · **a successful rebase onto current upstream
immediately before merge**. And: *no phase starts while the next phase's product decisions are
unanswered.*

---

## 11. Explicitly excluded from every number

Infrastructure and devops (MinIO provisioning and Coolify wiring, the new volume in the backup
set with a rehearsed restore, DNS/SPF/DKIM/DMARC for a separate sending domain, Resend account
and domain verification, Postgres sizing, workflow event-log retention) · third-party calendar
time (DocuSign production certification; Google/Microsoft OAuth verification including CASA
assessment, **4–8 weeks** and a recurring audit fee, if D1 forces it) · QA (no manual passes, no
cross-browser, no accessibility, **no performance testing** — yet R3 requires one as an exit
criterion) · UAT and client review (a 538-send, an invoice PDF layout, a dedupe merge UI and an
eSign flow each need sign-off; each round trip is 3–10 business days) · data migration and
cutover of the real Pipedrive data · **design** (every estimate assumes the developer designs
the UI; a dedupe workbench, a campaign composer and an invoice PDF are design work) · security
review (the programme adds a public unauthenticated unsubscribe POST, a widened public web-form
ingest, presigned object URLs and webhook receivers) · support, incident response, user
training, documentation beyond `content/docs` · project management and the ~25 product-decision
conversations.

---

## 12. The five things to do this week

1. ~~Fix the red CI~~ — **done**, `aaa9bc2e`.
2. **Get D1** — the client's mail provider and tenant policy. It can make or unmake ~20 days.
3. **Run S1** — the 30-day durable sleep spike (0.5d).
4. **Run S2** — the advisory-lock baseline (0.5d).
5. **Install S3** — the Docker conventions pre-push hook (1d).

One week that de-risks the other fifty.
