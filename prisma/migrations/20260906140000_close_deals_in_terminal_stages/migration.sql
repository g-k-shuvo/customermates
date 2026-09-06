-- Close the deals that 20260905130000_backfill_stage_kinds left stranded in a terminal stage.
--
-- That migration promoted a pipeline's terminal stages to StageKind 'won' and 'lost' by reading
-- their legacy weighting and name. It changed only "PipelineStage", never "Deal", so every deal
-- already parked on one of those stages kept "status" = 'open'. The product never produces that
-- combination on its own: MarkDealWonInteractor and MarkDealLostInteractor write the closing
-- columns and move the deal to the terminal stage in one transaction, so a deal reaches a
-- terminal stage only by being closed.
--
-- Left alone the rows are invisible to every M6 metric, which all read "Deal"."status":
-- win rate counts them as neither won nor lost, the sales-cycle percentiles skip them, and the
-- funnel scores them as not won. Worse, a deal on a 'won' stage carries that stage's 100%
-- probability into "weightedValue" while still counting as open, so it inflates the open
-- forecast by its full value.
--
-- The writes below mirror wonTransition and lostTransition (features/deals/close/
-- closing-transition.ts) exactly, so a backfilled deal is indistinguishable from one closed
-- through the interactor. "weightedValue" follows computeWeightedValue
-- (features/deals/deal-weighting.ts): totalValue * probability / 100.
--
-- TIMESTAMPS. A closing time was never recorded for these deals, so the best available evidence
-- is when the deal entered the terminal stage; "updatedAt" is the fallback for rows the pipeline
-- backfill placed without a stage-entry time.
--
-- LOST REASON. "lostReasonId" stays NULL. The interactor requires a reason from the user, but no
-- reason was ever captured for a historical loss and inventing one would misreport the pipeline.
-- The column is nullable precisely so imported and backfilled losses can omit it.
--
-- IDEMPOTENCY. The "status" = 'open' predicate is the guard: after a successful run the rows are
-- won or lost and no longer match, and a re-run updates nothing. Deals an administrator has since
-- reopened onto an open stage are equally unmatched.

UPDATE "Deal" d
SET "status" = 'won',
    "probability" = 100,
    "wonAt" = COALESCE(d."stageEnteredAt", d."updatedAt"),
    "lostAt" = NULL,
    "closedAt" = COALESCE(d."stageEnteredAt", d."updatedAt"),
    "lostReasonId" = NULL,
    "lostNotes" = NULL,
    "rottingAt" = NULL,
    "weightedValue" = d."totalValue",
    "updatedAt" = now()
FROM "PipelineStage" s
WHERE s."id" = d."stageId"
  AND s."companyId" = d."companyId"
  AND s."kind" = 'won'
  AND d."status" = 'open';

UPDATE "Deal" d
SET "status" = 'lost',
    "probability" = 0,
    "wonAt" = NULL,
    "lostAt" = COALESCE(d."stageEnteredAt", d."updatedAt"),
    "closedAt" = COALESCE(d."stageEnteredAt", d."updatedAt"),
    "lostNotes" = NULL,
    "rottingAt" = NULL,
    "weightedValue" = 0,
    "updatedAt" = now()
FROM "PipelineStage" s
WHERE s."id" = d."stageId"
  AND s."companyId" = d."companyId"
  AND s."kind" = 'lost'
  AND d."status" = 'open';
