# Pipedrive migration

A one-off operational script (PRD 04, T4.2). It is **not** a product feature and nothing
outside `scripts/migrate-pipedrive/` is part of it.

It reads a Pipedrive account — either an on-disk JSON export or the Pipedrive v1 REST API —
and writes it into a Customermates workspace **through the public REST API** (`/api/v1/...`),
so every write goes through the interactors and keeps validation, domain events and tenant
scoping. It never touches Prisma.

---

## Prerequisites

1. A running instance you can reach over HTTP (`yarn dev` on `localhost:4000`, or a deployed
   URL).
2. An API key for a user of the target workspace: **Profile → API Keys → New key**. The key
   inherits that user's permissions, so it needs create/update on contacts, organizations,
   deals, leads, tasks, services, pipelines, and `company.update` for lost reasons.
3. A Pipedrive export, or a Pipedrive API token.
4. A decision on the gaps at the bottom of this file.

## Configuration

Everything can come from the environment (`.env` is loaded) or from a flag. Flags win.

| Flag | Environment | Meaning |
| --- | --- | --- |
| `--api-key` | `CRM_API_KEY` | **Required.** API key for the target workspace |
| `--base-url` | `CRM_BASE_URL` | Target base URL, default `http://localhost:4000` |
| `--source-dir` | `PIPEDRIVE_EXPORT_DIR` | Directory of Pipedrive JSON exports |
| `--pipedrive-domain` | `PIPEDRIVE_DOMAIN` | Pipedrive company domain, e.g. `acme` |
| `--pipedrive-token` | `PIPEDRIVE_API_TOKEN` | Pipedrive API token |
| `--fallback-owner` | `MIGRATION_FALLBACK_OWNER_EMAIL` | Nominated owner for records whose Pipedrive user has no match |
| `--default-currency` | `MIGRATION_DEFAULT_CURRENCY` | Currency for the monetary custom columns, default `eur` |
| `--dry-run` | — | Report only; writes nothing |
| `--only` | — | Comma-separated subset of `organizations,contacts,pipelines,stages,lostReasons,deals,leads,tasks,notes` |
| `--limit` | — | Cap the source records read per entity (useful for a first pass) |
| `--won-stage-name` / `--lost-stage-name` | — | Names of the terminal stages added to each imported pipeline (default `Won` / `Lost`) |
| `--make-default-pipeline` | — | Mark the first imported pipeline as the workspace default |
| `--update-existing` | — | Re-apply the mapping to records an earlier run created (off by default) |
| `--skip-column-provisioning` | — | Fail instead of creating missing `pipedrive_*` columns |
| `--report` | — | Also write the reconciliation report to this path |

Either `--source-dir` **or** both `--pipedrive-domain` and `--pipedrive-token` must be given.

### On-disk export layout

`--source-dir` expects Pipedrive's own JSON. Each file may be a bare array, the API envelope
`{ "data": [ ... ] }`, or JSON Lines. Missing files are treated as "this entity was not
exported"; a missing *directory* is a hard error.

```
organizations.json   persons.json     pipelines.json   stages.json
deals.json           deal-flow.json   activities.json  notes.json
users.json           dealFields.json  leads.json       leadLabels.json
```

`deal-flow.json` is the concatenation of `GET /deals/{id}/flow` for every deal; each entry is
matched back to its deal by `data.item_id`.

---

## The dry run

Always start here. It reads the target and the source, resolves every mapping, and reports
what it *would* do without issuing a single write:

```bash
yarn migrate:pipedrive --dry-run \
  --source-dir ./pipedrive-export \
  --fallback-owner ops@example.com
```

The dry run tells you three things worth reading before the real run:

- **Counts per entity**, so you can sanity-check the export against Pipedrive's own numbers.
- **Unmapped values** — owner emails with no matching user, customised Pipedrive activity
  types, deal field types with no column type, deal references to records that were not
  exported, and closing transitions that could not be made.
- **Skipped records**, each with the reason it was skipped.

Because the dry run still *reads* the target, it also correctly reports a second dry run as
"nothing to create" once the real run has happened.

## The real run

```bash
yarn migrate:pipedrive \
  --source-dir ./pipedrive-export \
  --fallback-owner ops@example.com \
  --report ./pipedrive-migration.txt
```

The order is fixed and matters — deals cannot be placed before the things they reference exist:

1. `pipedrive_*` bookkeeping columns and one custom column per Pipedrive deal field
2. **Pipelines and stages**, keyed by name
3. **Lost reasons**, the distinct set taken from the lost deals
4. **Organizations**
5. **Persons** → contacts (linked to their organization)
6. **Deals** → created open, stage history replayed, then closed
7. **Leads** → leads (linked to the contact and organization imported above)
8. **Activities** → tasks
9. **Notes** → appended to the owning record

The process exits non-zero if any entity fails to reconcile.

**Automations, routines and webhooks fire during the run.** Every import goes through the same
interactors a person would use, so each created record raises its domain event. A
record-created automation runs once per imported record (a labelling automation labels every
imported lead), routines and webhooks see every record, and each open imported lead gets the
usual follow-up task (archived, converted and unqualified ones do not). Pause the workspace's
automations and webhooks for the real run unless that is what you want.

## Re-running

Re-running is safe and creates no duplicates. Every imported record carries its Pipedrive id
in a `pipedrive_id` custom column; the script reads that column back at the start of each run
and treats anything it finds as already imported.

- Records that already exist are left alone (`unchanged` in the report). Pass
  `--update-existing` to re-apply the mapping to them — note this overwrites local edits.
- A deal whose closing transition did not complete on an earlier run is finished on the next
  one, so a partial failure is self-healing.
- Stage history is replayed **only for deals this run creates**, so a second run does not
  append a duplicate funnel.
- Notes are tracked per record in `pipedrive_note_ids`; only notes not already listed there
  are appended.

## The reconciliation report

Printed at the end of every run (and written to `--report` if given):

```
entity        source  target  created updated skipped status
organizations 2       1       1       0       1       ok
deals         3       2       2       0       1       ok
```

An entity reconciles when `source == target + skipped`. Every skipped record is listed with
its Pipedrive id and the reason, and every source value that had no home is listed with how
often it occurred.

---

## What lands where

| Pipedrive | Target |
| --- | --- |
| Organization | `Organization` (`name`; address → `pipedrive_address`) |
| Person | `Contact` (`firstName`/`lastName`; emails → `mail` identifiers; phones → `pipedrive_phone`) |
| Pipeline | `Pipeline`, matched by name |
| Stage (`name`, `order_nr`, `deal_probability`) | `PipelineStage` (`name`, `position`, `probability`); `rotten_days` → `rottingDays` when `rotten_flag` is set |
| — | A terminal `Won` and `Lost` stage is appended to every imported pipeline, because the closing transitions move a deal to the stage of that kind |
| Deal | `Deal` (`name` ← `title`, `expectedCloseDate` ← `expected_close_date`, `probability`) |
| Deal `value` | `baseValue` (so `totalValue` = value + any services added later) — see below |
| Deal status `open`/`won`/`lost` | `MarkDealWon` / `MarkDealLost` / `ReopenDeal` |
| `lost_reason` | `LostReason`, the distinct set created first and matched by name |
| Deal custom fields | `CustomColumn` + `CustomFieldValue` (`enum` → `singleSelect`, `date` → `date`, `monetary` → `currency`, the rest → `plain`) |
| Deal flow (`stage_id` changes) | `DealStageHistory`, replayed oldest first |
| Activity | `Task` (`name` ← `subject`, `activityKind` ← `type`, `dueAt` ← `due_date` + `due_time`, `durationMinutes` ← `duration`) |
| Lead | `Lead` (`title`, owner, contact ← `person_id`, organization ← `organization_id`, labels, `value`) — see below |
| Note | `notes` on the owning deal, lead, contact or organization, most specific first |
| Owner (`owner_id` / `user_id`) | `User` matched by email, else the nominated `--fallback-owner`, reported either way |
| Pipedrive id of every record | `pipedrive_id` custom column on that entity |

### Deal value lands in `baseValue`

A deal's `totalValue` is `baseValue + sum(service.amount × quantity)`. The migration writes the
Pipedrive amount to `baseValue` and attaches no services, so `totalValue` is exactly the
Pipedrive amount and `totalQuantity` stays 0 until someone adds service lines. The raw amount
and currency are also written to the `pipedrive_value` and `pipedrive_currency` columns.
Negative Pipedrive values are not representable (`baseValue` cannot be negative); those deals
import with a value of 0 and are reported.

Runs made before `baseValue` existed carried the value on a unit-priced `Pipedrive deal value`
service with `quantity = value`. Convert those deals once, before migrating deals again:

```bash
yarn migrate:pipedrive:base-value            # dry run: how many deals, how much value
yarn migrate:pipedrive:base-value --apply    # move it into baseValue, delete the service
```

The conversion keeps every `totalValue` and `weightedValue` as it was and resets
`totalQuantity` to the count of real service lines. It is safe to re-run. The deal step refuses
to start while the `Pipedrive deal value` service still exists, because writing `baseValue` on
top of that line would count the value twice.

### Leads

Pipedrive leads are read from `leads.json` and `leadLabels.json` (or `GET /leads?archived_status=all`
and `GET /leadLabels`). A lead's id is a UUID, not a number, so it is tracked in the lead's own
`pipedrive_id` column.

- **Status.** Pipedrive leads have no workflow status. An open lead starts as `new` and an
  archived one is imported as `archived`. With `--update-existing` a re-run never moves a lead
  back to `new`: only an archive made in Pipedrive since the last run is carried over.
- **Links.** The contact and the organization are linked when the same or an earlier run
  imported them; a reference to one that was not imported is listed as unmapped
  (`lead.person_id`, `lead.organization_id`).
- **Labels** arrive by name. A label id missing from `leadLabels.json` is reported
  (`lead.label_ids`).
- **Value.** `value.amount` becomes the lead's value as it is. An amount in a currency other
  than `--default-currency` is not converted and is reported (`lead.value.currency`).
- **Expected close date** lands in `pipedrive_expected_close_date`, a date column, because a
  lead has no close date of its own. The conversion dialog asks for one when the lead becomes a
  deal.
- **Source.** Every imported lead has the source origin `pipedrive`.
- **Notes** with a `lead_id` are appended to the lead's notes, tracked in its own
  `pipedrive_note_ids`, like the other entities.
- **Activities.** A task cannot be linked to a lead in this product, so an activity attached to
  a lead imports with its other links and is counted under `activity.lead_id` in the report.

The lead columns are only provisioned when the run includes `leads` (or `notes`, for the note
bookkeeping), so a run that leaves leads out needs no lead permissions.

### Custom columns are created over MCP

There is no REST route for custom columns. The script calls the `manage_custom_columns` tool
on `/api/v1/mcp?toolsets=custom-columns`, which is the same interactor behind the same
`x-api-key` credential — still not raw Prisma. Pass `--skip-column-provisioning` to make a
missing column a hard error instead (create them in the UI first if you prefer).

---

### Activities land on the Task fields, with one exception

`Task` carries `activityKind`, `dueAt` and `durationMinutes`, so those are mapped rather than
stringified:

- `activityKind` — Pipedrive's six **default** activity types (`call`, `meeting`, `email`,
  `task`, `deadline`, `lunch`) are exactly the `ActivityKind` values and map straight across.
  A type your account has customised has no matching kind: it stays in the task's notes and is
  listed in the report's unmapped values.
- `dueAt` — `due_date` plus `due_time`, read as UTC. A due date with no time becomes midnight.
- `durationMinutes` — Pipedrive's `HH:MM` duration, as whole minutes. A zero-length activity
  leaves the field empty, because the field is a positive integer.

The exception is **completion**. `Task.completedAt` exists on the model but is read-only over
the public REST API — neither `POST /api/v1/tasks` nor `PUT /api/v1/tasks/{id}` accepts it —
and this script writes only through that API. A done activity therefore imports as an open
task carrying `Completed in Pipedrive: yes` in its notes, and `activity.done` is listed in the
report's unmapped values.

To close this, the target needs an endpoint that completes a task (the shape the deal
transitions already use: `POST /api/v1/deals/{id}/won`). Once one exists, the migration calls
it for every activity with `done: true` — add it to `CrmWrites`, call it after the task
upsert, and treat a failure the way `applyClosingTransition` does: an unmapped value, not a
skipped record, because the task itself has already landed. Note that such an endpoint stamps
`completedAt` with `now()`, so the completion *date* stays a fidelity limit either way, like
the close timestamps below.

---

## Gaps to raise with the client before running this

The PRD names three. The first of them — Pipedrive activity types having no home — is closed:
`Task` carries `activityKind`, `dueAt` and `durationMinutes` in this tree and the migration
uses them (see above). Only task *completion* is still unwritable. Two remain untouched.

1. **File attachments are not modelled anywhere in this product.** There is no file storage in
   the repository at all, so Pipedrive files and the `file` deal-field type cannot be
   migrated. `file` fields are reported as unmapped rather than silently flattened to text.
   Attachments have to stay in Pipedrive or move somewhere else entirely.

2. **Email threads tied to deals cannot be imported.** That surface lives in `ee/`, is Cloud
   only, and depends on `ConnectedAccount`, which is unavailable in a self-hosted deployment.
   Deal email history stays in Pipedrive.

Three further fidelity limits are worth putting in front of the client at the same time:

3. **Close timestamps are the import time, not the original.** `MarkDealWon` / `MarkDealLost`
   stamp `wonAt`/`lostAt`/`closedAt` with `now()`, and no interactor accepts a historical
   value. Pipedrive's `close_time` (falling back to `won_time`/`lost_time`) is preserved in the
   `pipedrive_closed_at` custom column, so the real date is available for reporting, but
   won/lost dashboards built on `closedAt` will show the migration date.

4. **Stage history preserves order, not timing.** `stageEnteredAt` is set to `now()` on every
   stage change, so replaying the deal flow produces a correctly ordered `DealStageHistory`
   chain (from-stage → to-stage, in the sequence it happened) whose timestamps are all from
   the migration run. The funnel shape survives; time-in-stage does not.

5. **A person's second and later organizations are dropped.** Pipedrive links a person to one
   organization, which is imported; if your account uses a custom field for additional
   organizations it arrives as text on a custom column, not as a relation.

---

## Tests

The pure mapping and reconciliation layers are unit tested and run in the normal `node` vitest
project:

```bash
yarn vitest run --project node scripts/migrate-pipedrive
```

`mapping.test.ts` covers the field mappers, the owner fallback, the status-to-transition
decision and the chronological stage replay. `reconciliation.test.ts` covers the report
shape, the `source == target + skipped` rule and the rendered output.

`run-migration.test.ts` drives the orchestrator itself against an in-memory workspace — a
fake client holding records, custom columns and pipelines, and a writer that records every
call and applies it — so the parts that are neither pure mapping nor HTTP are covered too:
`--only`, `--update-existing`, stage appending, the closing transitions and the note merge.
Everything that talks HTTP is deliberately kept out of all three.
