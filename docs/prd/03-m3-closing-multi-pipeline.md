# PRD 03 — M3: Closing and multiple pipelines

**Estimate:** 10–15 days · **Depends on:** M2 · **Blocks:** M6

Make deals closable and let a company run more than one sales process.

---

## User stories

- As a rep, I mark a deal won, or lost with a reason, and it leaves my open board.
- As a manager, I see which deals have gone stale in their stage.
- As an admin, I run separate pipelines for New Business and Renewals.
- As a manager, I can ask how long deals sat in each stage.

---

## T3.1 — Lost reasons

```prisma
model LostReason {
  id        String   @id @default(uuid())
  companyId String
  name      String
  position  Int      @default(0)
  archivedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  deals     Deal[]

  @@index([companyId, position])
}
```

New slice `features/lost-reasons/` — full CRUD, same pattern, own `Resource` value or
folded under `company`, plus a settings screen. Seed a starter set on company creation:
"Price", "Lost to competitor", "No budget", "No decision", "Bad timing".

---

## T3.2 — Deal closing fields

```prisma
// added to model Deal
  lostReasonId String?
  lostNotes    String?
  wonAt        DateTime?
  lostAt       DateTime?
  closedAt     DateTime?
  lostReason   LostReason? @relation(fields: [lostReasonId], references: [id], onDelete: SetNull)

  @@index([companyId, status, closedAt])
```

`status` and `DealStatus` already exist from M2.

---

## T3.3 — Mark won / mark lost

Two interactors in `features/deals/close/`:

- `MarkDealWonInteractor` — sets `status = won`, `wonAt = now()`, `closedAt = now()`,
  moves the deal to the pipeline's `kind = won` stage if one exists, sets effective
  probability to 100.
- `MarkDealLostInteractor` — requires `lostReasonId`, optional `lostNotes`, sets
  `status = lost`, `lostAt`, `closedAt`, moves to the `kind = lost` stage if one exists,
  probability 0.

Also a `ReopenDealInteractor` — clears the closing fields, `status = open`, back to a
nominated open stage.

Rules:
- Closing an already-closed deal is a validation failure, not a throw.
- Marking lost without a reason is a validation failure.
- Both publish `DomainEvent.DEAL_UPDATED`.
- Colocated `.openapi.ts` for each; regenerate the spec.

Stage `kind` becomes meaningful here. Extend the stage admin UI to set it, and enforce at
most one `won` and one `lost` stage per pipeline.

---

## T3.4 — Open board excludes closed deals

- The kanban shows `status = open` by default.
- A `status` filter lets users see won, lost or all.
- Closed deals keep their stage for reporting; they are filtered, not moved out.
- List and detail views show a clear won/lost badge with the reason.

---

## T3.5 — Stage change history

```prisma
model DealStageHistory {
  id          String    @id @default(uuid())
  companyId   String
  dealId      String
  fromStageId String?
  toStageId   String
  enteredAt   DateTime  @default(now())
  exitedAt    DateTime?
  durationSeconds Int?
  userId      String?
  company     Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  deal        Deal      @relation(fields: [dealId], references: [id], onDelete: Cascade)
  user        User?     @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([companyId, enteredAt])
  @@index([dealId, enteredAt])
  @@index([toStageId])
}
```

Written by a listener on `DomainEvent.DEAL_UPDATED` in
`features/deals/listener/deal-stage-history.listener.ts`. On a stage change: close the open
row (`exitedAt`, `durationSeconds`) and open a new one.

**Do not use `AuditLog` for this.** Its payload is an untyped JSON blob — correct for
compliance, useless for aggregation. M6 depends on this table being queryable.

Backfill: for deals migrated in M2, insert one row per deal for its current stage with
`enteredAt = stageEnteredAt`. Historical transitions before this release are not
recoverable and that is expected — note it in the release notes.

---

## T3.6 — Deal rotting

`isRotting` is derived, not stored: a deal is rotting when `status = open`,
`stage.rottingDays` is non-null, and `now() - stageEnteredAt > rottingDays`.

- Compute in the repository query so it is filterable and sortable without loading rows.
- Kanban card badge, list column, and a "Rotting" filter.
- Stage admin sets `rottingDays`; null disables it for that stage.

---

## T3.7 — Multiple pipelines in the UI

- Pipeline switcher on the deals page. Selection persists per user via the existing `P13n`
  model.
- Pipeline is part of the URL state — extend `components/data-view/data-view-url-sync.ts`.
- Deal create and edit let the user pick pipeline then stage, stages filtered to the chosen
  pipeline.
- Moving a deal between pipelines resets `stageId` to the target's first stage and writes
  history.
- Archived pipelines stay readable but accept no new deals.

Scoping runs through `app/[locale]/(protected)/deals/components/deals.store.tsx`.

---

## Milestone acceptance

- A rep can mark won and lost, with reason, from both detail view and kanban card.
- Closed deals leave the open board and remain findable and reportable.
- Rotting deals are visibly flagged and filterable.
- A company can run two pipelines with different stages and switch between them.
- `DealStageHistory` accumulates correct rows with durations on every stage move.
- All five locales updated; OpenAPI regenerated; conventions green.
- Unit tests cover: won/lost transitions, double-close rejection, lost-without-reason
  rejection, reopen, history row open/close correctness, rotting boundary conditions.
