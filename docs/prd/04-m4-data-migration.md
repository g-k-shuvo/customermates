# PRD 04 — M4: Getting their data in

**Estimate:** 8–13 days · **Depends on:** M2, M3

There is no import feature anywhere in this product — no CSV, no wizard, nothing. This
milestone builds one, then uses it.

---

## T4.1 — CSV / XLSX import

New slice `features/import/` plus a UI under each entity's list view.

**Flow**

1. Upload CSV or XLSX. Detect delimiter and header row.
2. Choose target entity: contacts, organizations, deals, tasks, services.
3. Map columns to fields — including custom columns and, for deals, pipeline and stage.
   Auto-suggest by fuzzy header match. Mapping is savable and reusable.
4. Validate every row against the entity's Zod schema. Report per-row, per-field errors.
5. Dry run: counts of create / update / skip / error, no writes.
6. Commit in batches through the existing `create-many` interactors — do not write Prisma
   directly, or you lose validation, events and tenant scoping.
7. Downloadable error report of rejected rows with reasons.

**Requirements**

- Duplicate handling: skip, update, or create — user's choice, keyed on a nominated column
  (typically email for contacts, name for organizations).
- Value mapping for enum-like targets: map source strings to stages, lost reasons and
  `singleSelect` options without pre-editing the file.
- Batch size bounded; a 50k-row file must not exhaust memory or hold a transaction open.
- An import is resumable and its result is recorded, with counts, so a partial failure is
  diagnosable.
- Import is permissioned — reuse the target entity's `create` action.

**Model**

```prisma
model ImportJob {
  id            String   @id @default(uuid())
  companyId     String
  userId        String
  entityType    EntityType
  status        String
  fileName      String
  mapping       Json
  totalRows     Int      @default(0)
  createdCount  Int      @default(0)
  updatedCount  Int      @default(0)
  skippedCount  Int      @default(0)
  errorCount    Int      @default(0)
  errors        Json?
  createdAt     DateTime @default(now())
  completedAt   DateTime?
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([companyId, createdAt])
}
```

Long imports run on the existing workflow runner (`WORKFLOW_TARGET_WORLD`,
`workflows/`) rather than in a request.

---

## T4.2 — Pipedrive migration

A script under `scripts/migrate-pipedrive/`, not a product feature.

**Order matters** — organizations, then persons, then deals, then activities, then notes.
Deals reference the first two; getting the order wrong means a second pass.

**Mapping**

| Pipedrive | Target |
|---|---|
| Organization | `Organization` |
| Person | `Contact` |
| Pipeline | `Pipeline` |
| Stage (name, order, `deal_probability`) | `PipelineStage` |
| Deal | `Deal` (`totalValue` ← `value`, `expectedCloseDate` ← `expected_close_date`) |
| Deal status open/won/lost | `DealStatus` + `wonAt` / `lostAt` / `closedAt` |
| `lost_reason` | `LostReason` (create the distinct set first) |
| Deal custom fields | `CustomColumn` + `CustomFieldValue` |
| Deal flow / stage changes | `DealStageHistory` |
| Activity | `Task` — needs M5 for due dates; until then import as untyped tasks |
| Note | `notes` JSON on the owning record |
| Owner | `User` by email; unmatched owners go to a nominated fallback and are reported |

**Requirements**

- Store the Pipedrive id on every imported record so the run is re-runnable and
  reconcilable. Add a `CustomColumn` per entity (`pipedrive_id`) rather than a schema
  column — keeps the fork delta small.
- Replay stage changes into `DealStageHistory` in chronological order so the historical
  funnel survives.
- Write through the REST API or the interactors, never raw Prisma.
- Dry-run mode that reports counts and unmapped values without writing.
- Final reconciliation: source count vs target count per entity, and a list of anything
  skipped with the reason.

**Known gaps to raise with the client before running it**

- Pipedrive activity types have no home until M5.
- File attachments are not modelled anywhere in this product.
- Email threads tied to deals cannot be imported — that surface is `ee/` and Cloud-only.

---

## Milestone acceptance

- A real Pipedrive export imports end to end into a clean instance.
- Counts reconcile per entity; every skipped row is explained.
- Deals land in the right pipeline and stage, with won/lost, reasons and close dates intact.
- Stage history is present and produces a sensible funnel.
- Re-running the migration creates no duplicates.
- The CSV importer is usable by a non-developer for a subsequent top-up import.
