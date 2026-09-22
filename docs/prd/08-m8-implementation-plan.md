# M8 web lead capture — implementation plan

Companion to `08-m8-web-lead-capture.md`. That document is the specification; this one
records what verifying it against the codebase changed, and the order the work should be
done in.

Verified against `5f3c66d4` on 22 Sep 2026 by reading the schema, the convention tests,
the workflow runtime and the two existing inbound receivers.

---

## Read this before the PRD

The PRD is accurate about the codebase as it stood when it was written, and its central
judgements hold: leads must not be deals, the raw payload must be stored before mapping,
and `@@unique([sourceId, externalId])` is the line that makes delivery idempotent. What
follows corrects the details that would cost a day each to discover while building.

**Use `docs/prd/08-m8-web-lead-capture.md`, not `prd/07-m7-web-lead-capture.md`.** The
root `prd/` directory is the original delivered pack; `docs/prd/` is the working copy and
is one milestone ahead. M7 was reassigned to email integration, which shipped. The two
lead-capture files are byte-identical apart from the renumbering.

---

## Corrections that change the work

### The organization domain match has nothing to match on

T8.4 step 2 matches an email domain against existing organizations. `Organization` has
`name` and nothing else — no `domain`, no `website`. `grep -n "domain\|website"` over
`prisma/schema.prisma` returns nothing for any model.

Decide before building. Adding `Organization.domain` is a schema change to an existing
model on a rebase path, and the column would be empty for every organization created
before it. Deriving the domain from `ContactIdentifier` rows where `channelClass = "email"`
needs no migration but has no index supporting it.

**Plan: skip domain matching in the first pass.** Match on exact name, else create. Ship
domain matching as a follow-up once there is real data showing how often it would fire.
The free-mail exclusion list the PRD calls for is still required whenever it does land, and
nothing in the codebase has one today.

This costs a named acceptance criterion, so say so rather than discover it during sign-off.
The PRD's own findings list a footer callback form on `jackimwoods.com` whose fields are
First Name, Last Name, Email, Phone, Message — no company field at all. With name matching
only, every lead from that form has a null organization forever. The criterion "submitting
each live form creates exactly one Lead with the contact and organization correctly matched
or created" cannot pass for it until domain matching ships. Either accept a null
organization for company-less forms and reword the criterion, or move domain matching into
the first pass and pay for `Organization.domain` up front.

### `channelClass` is required, and its helper lives in `ee/`

`ContactIdentifier.channelClass` is `String` NOT NULL with no default
(`prisma/schema.prisma:1644`). The PRD's snippet — `identifiers: [{ provider: "mail",
value: email }]` — omits it and will fail the insert. Real code calls
`channelClass(provider)` from `ee/messaging/provider.ts:15`, which maps
`mail|google|outlook` to `"email"`.

That helper is in the proprietary tree. Importing it is established practice outside `ee/`
(`app/layout.tsx`, `inbox/actions.ts`, several contacts components) and it is a pure
function, not an Enterprise feature being made operational — so this is not a licence
violation. It is a coupling to record: the dedupe key that guarantees one contact per
email address depends on a five-line function we may not modify and that rebases from
upstream.

### Lead's relations deviate from every other entity

Every entity links Contact, Organization and User through a join table with its own
`companyId` and unique constraint — `DealContact`, `DealOrganization`, `DealUser`,
`TaskContact`, `ContactOrganization`. The PRD's `Lead` uses direct nullable foreign keys,
which caps a lead at one contact and one organization, and introduces `ownerUserId`/`owner`
where the codebase says `userId`/`user` inside a join table.

**Plan: keep the direct foreign keys.** A lead genuinely has one submitter and one
company, and it converts into a deal that carries the join tables. Record the deviation
here so the next reader does not treat it as an oversight. Rename `ownerUserId` to
`assignedUserId` only if a reviewer prefers it; there is no precedent either way for a
single-owner column.

### Defects in the proposed schema

- `WebFormSubmission.leadId` is declared as a bare `String?` with no `@relation`, no
  reverse field on `Lead` and no index. Wire it properly or drop it and navigate from
  `Lead.submissionId`.
- `Lead` indexes `companyId,status,createdAt`, `companyId,ownerUserId` and `contactId`,
  but not `sourceId` or `organizationId`.
- `labels String[]` has no precedent among CRM records. The one similar field is
  `Company.tags`, which is operator-console workspace segmentation. Either name it `tags`
  for consistency or accept a lead-only mechanism knowingly.

### Adding `leads` to `Resource` touches eight files, only one of them enforced

`tests/conventions/i18n-key-resolution.test.ts` derives `RoleModal.resources.*` from
`Object.values(Resource)` and asserts the catalog matches, so the translation key cannot be
forgotten. Nothing checks the rest:

| File | What must change | Caught by |
| --- | --- | --- |
| `prisma/schema.prisma` | `leads` in `enum Resource` (lines 921-933) | — |
| `features/role/upsert-role.interactor.ts` | a `leads` block in the permissions Zod object (lines 22-65) | — |
| `.../role/role-modal.store.ts` | **two** hardcoded objects: `defaultRolePermissions()` (14-28) and the inline one in `setRole()` (121-133) | tsc |
| `app/[locale]/(protected)/company/components/role/role-modal.tsx` | a `renderResourcePermissions(Resource.leads)` row (162-182) | nothing |
| `i18n/locales/{en,de,es,fr,it}.json` | `RoleModal.resources.leads` | a test |
| `core/base/base-repository.ts` | `ModelWhereInputMap` (16-23), `modelToResourceMap` (51-58), `resourceOwnWhereMap` (98-116) | tsc, once one is touched |
| `app/components/app-sidebar.tsx` | nav gate (206-239) and quick-add entry (339-363) | nothing |
| `prisma/seeds/roles.ts` | grants in `salesManagerGrants` / `customerSuccessGrants` (41-64) | nothing |
| `tests/conventions/access-where-composition.test.ts` | an `accessWhere("lead")` entry in `HELPER_KEYS` (15-29) | nothing |

That last row is the one an adversarial review of this plan added, and it fails the same
way the others do. `helperFor()` returns `undefined` for any `accessWhere` call the map
does not name, and the scan then skips it — so a `LeadRepository` calling
`accessWhere("lead")` gets no tenant-scoping check at all, silently. It only applies if
leads use `accessWhere`, which the own/all/none read options imply they will.

The order matters. `UpsertRoleData["permissions"]` is inferred from the Zod schema, so once
`leads` is added there, TypeScript forces both store objects — a missing key and an excess
key are both compile errors. Do the Zod schema first and the compiler walks you through the
store. What the compiler cannot see is the **JSX list in `role-modal.tsx`**, which is the
row that was missing for `pipelines` until `53d0086a`, and the sidebar and seed entries.

Zod's key-stripping is still a live risk, just a narrower one than a whole-app silent
failure: an API client that POSTs `permissions.leads` against a schema without the block
gets a success response with the value discarded. That is an argument for adding the Zod
block first, not for distrusting the compiler.

**Add the missing enforcement — the cheap test first.** `UpsertRoleSchema.shape.permissions`
is a real `ZodObject` at runtime, so a test can import it and diff
`Object.keys(schema.shape.permissions.shape)` against `Object.values(Resource)` with no
parsing at all. That guards the entry which drops data rather than merely hiding a row, and
it is a handful of lines.

Then the modal: a test that reads `role-modal.tsx` with the TypeScript AST, collects the
`renderResourcePermissions(Resource.x)` arguments and compares them to the enum. Realistic —
fourteen convention tests already parse TSX with `ts.createSourceFile(..., ts.ScriptKind.TSX)`,
several doing heavier analysis than finding one call expression.

Write the Zod one first. An earlier draft of this plan proposed only the modal test, which
guards the cosmetic failure and leaves the silent one open.

### The enum change needs two migrations, not one

PostgreSQL will not let a new enum value be referenced by other statements in the
transaction that added it, and Prisma wraps each migration file in one transaction. The
`pipelines` precedent is exactly this, and says so in its own comment:

- `20260904140000_resource_pipelines` — `ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS
  'pipelines';` and nothing else.
- `20260904141000_seed_pipeline_permissions` — backfills `RolePermission` by copying every
  existing grant for `deals`, guarded by `NOT EXISTS` because CI applies migrations twice.

Copy both. Without the second, `leads` is invisible to every existing custom role: system
roles bypass permission checks, but a custom role with no `RolePermission` rows for a
resource is denied. Note this is separate from `prisma/seeds/roles.ts`, which seeds fixtures
for tests and local dev — production databases only get the migration.

### Adding a page breaks an unrelated convention test

`tests/conventions/page-state-contract.test.ts:63` asserts
`expect(protectedLoaders).toHaveLength(31)`. Adding `app/[locale]/(protected)/leads/page.tsx`
makes it 32. The same file carries a `collectionViews` array that must gain
`leads-page-view.tsx`, or the five-state contract silently stops covering the new page.

### The endpoint needs no OpenAPI work

`tests/conventions/rest-openapi-coverage.test.ts:585` walks `app/api/v1` only.
`app/api/webforms/[slug]` sits outside it, like the existing webhook and cron routes,
neither of which appears in the spec. The acceptance line about regenerating OpenAPI
applies to the `/v1/leads*` CRUD operations, not to the ingestion endpoint.
`terminology-boundary` and `legal-unipile-disclosure` do still scan all of `app/api`.

### Only the shell of the unipile receiver is copyable

`app/api/webhooks/unipile/v2/route.ts` is outside `ee/` and imports nothing from it, so
its signature verification and `core/utils/hmac.ts` are fair game. Everything past that is
`await getIngestUnipileWebhookInteractor().invoke(body)`, which `core/di.ts` wires entirely
into `ee/messaging/webhooks/*` and `ee/messaging/persistence/*` — the Enterprise
connected-account surface. Do not model the processing layer on it.

The PRD also points at the `reprocess-webhook-events` cron as if it belonged to
`features/webhook/`. It does not: that cron runs
`ee/messaging/ingest/reprocess-stuck-webhook-events.interactor.ts` over inbound Unipile
events. The retry precedent worth copying is `workflows/deliver-webhook.ts`, which sets
`deliverStep.maxRetries = 5` and classifies `408, 425, 429` as retryable. That file is
AGPL and does exactly what webform processing needs.

Note also that the existing header is `unipile-signature`, not `x-webform-signature`; the
PRD reads as though it were describing the existing route.

### Event-driven email has no precedent here

Only two `DomainEventListener` implementations exist, and neither sends mail — they write
a Task row and stage-history rows. Every real email send in this codebase is called
directly from the interactor that caused it (`InviteUsersByEmailInteractor`, the `ee/`
lifecycle interactors). T8.5's listener-sends-email design is new architecture, not a
copied pattern.

It is still the right shape — cross-entity side effects belong in listeners per
`CLAUDE.md` — but budget it as new work, and register the listener in
`EXPECTED_EVENT_LISTENERS` (`core/di.ts:457`), which fails fast at startup if the declared
events and the listener's `handlers` map disagree.

Adding `DomainEvent.LEAD_CREATED` also means deciding two opt-ins that are easy to
half-wire: `AUDIT_LOG_EXCLUDED_EVENTS` (omission means it *is* audit-logged) and
`WEBHOOK_EVENTS` in `features/webhook/webhook-event-registry.ts`, which `webhook.schema.ts`
imports (omission means it is *not* webhook-deliverable).

### The M5 dependency is already satisfied

T8.5 hedges that follow-up task due dates "depend on M5" and says to create an untyped
task until then. `Task` already has `dueAt`, `durationMinutes`, `completedAt`,
`completedById` and `activityKind`, shipped in `20260906120000_task_activity_scheduling`.
Set a real `dueAt`. The only gap is `TaskType`, which still has just
`userPendingAuthorization | custom`, so a follow-up uses `custom`.

### The async design rests on configuration nothing validates

This is the most serious operational finding, and it already bit this deployment.

`resolveWorkflowTargetWorld` (`@workflow/utils/dist/world-target.js:20`) falls back to the
`local` world when `WORKFLOW_TARGET_WORLD` is unset, with no error. `instrumentation.ts:26`
only starts the Postgres worker when that variable is truthy. Together: runs enqueue
successfully, return a `runId`, execute never, and are lost on restart — while every
endpoint in the chain reports success. Separately, `getExecutionBaseUrl`
(`@workflow/world-postgres/dist/queue.js:119`) needs `WORKFLOW_LOCAL_BASE_URL` or `PORT`,
and returns `undefined` without them.

Both compose files now set all four variables, after `5acc2382` fixed exactly this
incident — mailbox sync had been silently dead while the cron logged `ok` five times over.
But `.env.selfhost.template` documents **none** of them, so any operator reconstructing the
deployment from that template rather than copying the compose `environment:` block
verbatim reproduces the incident.

**Prerequisite task, before any of T8.1–T8.7:** document the four `WORKFLOW_*` variables in
`.env.selfhost.template`, and add a startup assertion that fails loudly when the resolved
world is `local` in a self-hosted deployment. A public endpoint that answers `202` and
silently drops every lead is the worst possible expression of this bug.

---

## Sequencing

Work in this order. Each phase is independently shippable and leaves the tree green.

**Phase 0 — make async failure loud. Done in `3f35afdf`.** The four `WORKFLOW_*` variables
are documented in `.env.selfhost.template`, and `instrumentation.ts` now throws at startup
when the world is unresolved in a self-hosted deployment rather than accepting jobs it will
never run.

**`Lead.source` is a forward reference — resolve it before Phase 2.** The PRD's `Lead`
declares `sourceId String?` with `source WebFormSource? @relation(...)`, but `WebFormSource`
is a T8.2 model that this plan does not build until Phase 5. Prisma cannot compile a
relation to a model that does not exist, so Phase 2 cannot ship the Lead schema as the PRD
writes it.

Two honest options, and the plan has to pick one rather than discover this mid-phase:

1. **Move `WebFormSource` into Phase 2** — define both models in the first migration, and
   leave the source-management UI and the endpoint in Phases 5 and 6. The table sits empty
   until then, which costs nothing.
2. **Ship `Lead` without the source columns** and add `sourceId` plus its relation in the
   Phase 5 migration.

Take option 1. Option 2 means a second migration altering a table that already has rows,
and it tempts exactly the bare-`String?`-without-`@relation` shortcut this plan criticises
in `WebFormSubmission.leadId`.

The same issue applies to `DomainEvent.LEAD_CREATED`, which T8.4 publishes in Phase 5-6 but
this plan introduces in Phase 7. That one is harmless — `DomainEvent` is a TypeScript enum,
so adding the member is a one-line change with no migration. Add it whenever the publishing
code first needs it.

**Phase 1 — the `leads` resource.** The eight-file `Resource` ripple in one commit, plus
the convention test that derives the modal's list from the enum. No feature code yet; this
is the part that fails silently if rushed.

**Phase 2 — the Lead entity.** `features/leads/` following `features/deals` (54 files, not
the 35 the old CLAUDE.md claimed), the migration, DI registration, `/v1/leads*` routes with
their colocated `.openapi.ts`, unit tests. Ends with leads creatable over REST.

**Phase 3 — the leads UI.** `/leads` list view modelled on
`app/[locale]/(protected)/organizations/` — the cleanest comparable, since deals' 37 files
are inflated by close/reopen/pipeline UI. That directory is 15 files, 13 of them outside
`[id]/`; budget the list view against those 13, not against a detail page this phase does
not build. Bump `page-state-contract.test.ts` and its
`collectionViews` array. Five locales throughout.

**Phase 4 — convert to deal.** `ConvertLeadToDealInteractor` plus its action route,
mirroring the shape of deals' `won`/`lost`/`reopen` routes.

**Phase 5 — submissions and source management.** `WebFormSubmission`, the mapping JSON,
and the source-management UI (`WebFormSource` itself ships in Phase 2, see above). No public endpoint yet; seed a source by hand and
drive processing from a test.

**Phase 6 — the public endpoint.** `POST /api/webforms/[slug]`, HMAC verification copied
from the unipile shell, the per-source rate limiter, `202` and enqueue. Processing runs as
a workflow modelled on `deliver-webhook.ts`'s retry classification.

**Phase 7 — notification.** `DomainEvent.LEAD_CREATED`, the listener, its
`EXPECTED_EVENT_LISTENERS` entry, the follow-up task with a real `dueAt`.

**Phase 8 — WordPress plugin and backfill.** Estimate separately; it shares no tooling
with this repo.

---

## On the estimate

9–14 days is defensible for Phases 1–3 — the Lead entity and its list view — and short for
the whole PRD. The figure was anchored on `features/deals` being 35 files; it is 54, and
`features/tasks` is 55 against a claimed 38. Both were corrected in `CLAUDE.md`.

The PRD also bundles three unlike bodies of work under one number: an in-repo CRUD entity,
an in-repo ingestion and security surface, and an out-of-repo WordPress plugin that none of
the 77 convention tests, the five-locale system or the OpenAPI generator can verify.
`features/mailbox` — 87 files, the largest slice in the repo and the closest comparable —
had no new `Resource` value and no external plugin. Its inbound matching
(`findContactMatches`, `prisma-mailbox.repository.ts:409`) matches addresses against
existing `ContactIdentifier` rows but never creates a contact, resolves an organization or
excludes free-mail domains, so T8.4 is the larger job.

Estimate the phases separately, and the plugin separately again.
