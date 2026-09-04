# PRD 02 — M2: Pipeline core

**Estimate:** 12–16 days · **Depends on:** M1 · **Blocks:** M3, M4, M6

Give deals a real pipeline. This is the largest and most important milestone.

---

## User stories

- As a rep, I move a deal between ordered stages on a board and it stays there.
- As a rep, I see a forecast that reflects how likely each stage is to close.
- As an admin, I configure stages once, with names, order and probabilities, and every
  deal uses them.
- As an existing user, my current custom-column stages become real stages without my
  losing a single deal or my board changing shape.

---

## T2.1 — Schema: `Pipeline` and `PipelineStage`

Add to `prisma/schema.prisma`. Both models carry `companyId` — `prisma-tenant-fk.test.ts`
requires it.

```prisma
enum StageKind { open won lost }
enum DealStatus { open won lost }

model Pipeline {
  id         String    @id @default(uuid())
  companyId  String
  name       String
  position   Int       @default(0)
  isDefault  Boolean   @default(false)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  company    Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  stages     PipelineStage[]
  deals      Deal[]

  @@index([companyId])
  @@index([companyId, position])
}

model PipelineStage {
  id          String    @id @default(uuid())
  companyId   String
  pipelineId  String
  name        String
  position    Int       @default(0)
  probability Float     @default(0)
  rottingDays Int?
  kind        StageKind @default(open)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  company     Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  pipeline    Pipeline  @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  deals       Deal[]

  @@index([companyId])
  @@index([pipelineId, position])
}
```

Rules:
- `probability` is 0–100. Validate in the Zod schema, not only the DB.
- Exactly one `Pipeline` per company may have `isDefault = true`. Enforce in the interactor.
- A pipeline must always retain at least one stage. Deleting the last stage fails.
- Deleting a stage that still holds deals fails with a typed error naming the count. Offer
  a move-to-stage parameter instead.
- `kind` lets M3 mark terminal stages. In M2 seed everything as `open`.

**Migration:** `prisma/migrations/<ts>_pipeline_and_stages/`.

---

## T2.2 — Schema: Deal columns

```prisma
// added to model Deal
  pipelineId        String?
  stageId           String?
  status            DealStatus @default(open)
  expectedCloseDate DateTime?
  probability       Float?
  stageEnteredAt    DateTime?
  pipeline          Pipeline?      @relation(fields: [pipelineId], references: [id], onDelete: SetNull)
  stage             PipelineStage? @relation(fields: [stageId], references: [id], onDelete: SetNull)

  @@index([companyId, pipelineId, stageId])
  @@index([companyId, status])
  @@index([expectedCloseDate])
```

`lostReasonId`, `wonAt` and `lostAt` arrive in M3 — do not add them here.

`probability` on the deal is an optional per-deal override; when null the stage's
probability applies.

---

## T2.3 — Migration: backfill from the custom column

The important task in this milestone. Existing installs must come through without losing
their board.

For each `Company`:

1. If `dealWeightingColumnId` is null, create a pipeline named "Sales" with a single stage
   "Open" at probability 0, and assign every deal to it.
2. Otherwise read that `CustomColumn`. Its `options` JSON is an array of
   `{ value, weight }` — see `features/deals/deal-weighting.ts` for the exact shape and
   reuse `readOptionWeights`.
3. Create one `Pipeline` named after the column's `label`, `isDefault = true`.
4. Create one `PipelineStage` per option, `position` following the stored option order,
   `probability` from `weight` (default 0 when absent).
5. For each deal, read its `CustomFieldValue` for that column and set `stageId` to the
   matching stage. Unmatched or empty values go to the first stage.
6. Set `pipelineId` on every deal, `stageEnteredAt = updatedAt`, `status = open`.

Requirements:
- Idempotent — re-running changes nothing.
- Batched; must not load every deal into memory.
- Logs a per-company summary of deals migrated and unmatched values.
- **Do not delete the custom column.** Leave it in place as a rollback path; retire it in a
  later release once the client has signed off.

**Acceptance:** a database seeded with the old shape, migrated, shows the same board with
the same columns in the same order and every deal in the same place.

---

## T2.4 — Feature slice: `features/pipelines`

Follow `features/deals` exactly. Expect 25–30 files.

```
features/pipelines/
  pipeline.schema.ts
  prisma-pipeline.repository.ts
  find-pipelines-by-ids.repo.ts
  get-company-wide-pipeline.repo.ts
  get/    get-pipelines, get-pipeline-by-id
  upsert/ create-pipeline, update-pipeline, reorder-stages
  delete/ delete-pipeline
  stages/ create-stage, update-stage, delete-stage
  __tests__/
```

Each operation: `.interactor.ts` + colocated `.openapi.ts` + a narrow `.repo.ts`.

- `@TenantInteractor({ resource: Resource.pipelines, action: ... })`
- Add `pipelines` to the `Resource` enum in `prisma/schema.prisma`
- Seed `RolePermission` rows for it in the same migration, mirroring `deals`, or the
  feature is invisible to every existing role
- Register everything in `core/di.ts`
- Return expected failures, never throw them
- All Prisma writes go through `this.accessWhere(...)`

---

## T2.5 — Deals: read and write the new fields

Touch, following the existing patterns:

- `features/deals/deal.schema.ts` — add the fields to `DealDtoSchema`
- `features/deals/upsert/create-deal-base.schema.ts`, `update-deal-base.schema.ts`
- `create-deal.repo.ts`, `update-deal.repo.ts`, `prisma-deal.repository.ts`
- all 12 deal `.openapi.ts` files
- `features/deals/get/get-deals-configuration.interactor.ts` — return the company's
  pipelines and stages alongside `customColumns`

Rules:
- Creating a deal without `pipelineId` assigns the default pipeline and its first stage.
- Changing `stageId` sets `stageEnteredAt = now()`.
- Changing `stageId` to a stage in a different pipeline also updates `pipelineId`.
- Rejecting a `stageId` that does not belong to `pipelineId` is a validation failure, not
  a thrown error.

Run `yarn openapi:generate` and commit the diff.

---

## T2.6 — Kanban grouped by stage

**Do not rebuild the board.** The grouped-pagination contract in
`core/base/base-get.schema.ts` is keyed on `groupingColumnId: z.string()` — a plain string,
not a foreign key:

```ts
export const GroupedPaginationRequestSchema = z.object({
  groupingColumnId: z.string(),
  perGroup: z.number().int().min(1).max(KANBAN_PER_GROUP_MAX),
  overrides: z.record(z.string(), z.number().int().min(1).max(KANBAN_PER_GROUP_MAX)).optional(),
});
```

**Change.** Reserve the sentinel `"__stage__"`. When `groupingColumnId` equals it, group by
`Deal.stageId` instead of a custom field value. Everything else — `perGroup`, `overrides`,
`groupCounts`, `groupValueSums`, `KANBAN_EMPTY_GROUP_KEY` — is reused unchanged.

Then in `components/data-view/data-kanban-view.tsx`, when grouping by the sentinel, point
drag-and-drop at the stage-change action rather than a custom-field write. Keep
`runUserAction` around the promise — `user-action-boundary.test.ts` enforces it.

Column order comes from `PipelineStage.position`, not from insertion order. Empty stages
must still render as columns.

**This design persists for free.** `P13n` — the per-user view-preference model — already
stores `groupingColumnId` as a nullable string, scoped `@@unique([companyId, userId, p13nId])`.
The sentinel round-trips through it with no schema change, so a user who chooses the stage
board gets it back on their next visit.

**Acceptance**
- Board shows one column per stage, in configured order, including empty ones.
- Dragging a card moves the deal and persists `stageId` and `stageEnteredAt`.
- Per-column totals show summed `totalValue` and `weightedValue`.
- Grouping by an ordinary custom column still works exactly as before.

---

## T2.7 — Forecast from stage probability

`features/deals/deal-weighting.ts` currently derives weights from custom-column options:

```ts
export function computeWeightedValue(totalValue: number, weight: number | undefined): number | null
export function readOptionWeights(options: unknown): Map<string, number>
```

**Change.** `weightedValue = totalValue * effectiveProbability / 100`, where
`effectiveProbability` is `deal.probability ?? stage.probability`. Recompute on any change
to `totalValue`, `stageId` or `probability`.

Also update `app/[locale]/(protected)/company/components/company-settings/company-forecasting-section.tsx`
and `company-settings.store.ts` to configure stage probabilities instead of nominating a
weighting column. Keep `Company.dealWeightingColumnId` in the schema for now — it is the
rollback path.

**Acceptance:** a deal at 10,000 in a 40% stage has `weightedValue` 4000; overriding the
deal to 65% gives 6500; moving it to a 90% stage gives 9000.

---

## T2.8 — Pipeline and stage admin UI

Under company settings: create, rename, reorder and archive pipelines; within a pipeline,
add, rename, reorder (drag), set probability and delete stages. Deleting a stage that holds
deals prompts for a destination stage.

All copy goes to all five locales. No hardcoded strings.

---

## Milestone acceptance

- A migrated database shows the same board it had before, now backed by real stages.
- A new company gets a default pipeline and can configure stages from settings.
- Dragging a deal moves it and updates the forecast.
- REST API exposes pipelines and stages; the OpenAPI spec is regenerated.
- `yarn lint`, `yarn vitest run tests/conventions`, `yarn build` all pass.
- Unit tests cover: probability computation, stage/pipeline mismatch rejection, last-stage
  deletion refusal, and the backfill migration against a seeded fixture.
