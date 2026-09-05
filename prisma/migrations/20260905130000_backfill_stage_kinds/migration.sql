-- Promote the terminal stages of already-backfilled pipelines to StageKind 'won' and 'lost'.
--
-- 20260904130000_backfill_pipelines_from_custom_column created every stage with
-- kind = 'open' because the legacy singleSelect CustomColumn it read carried no notion of
-- a terminal stage. That left every pre-existing company without a won or a lost stage, so
-- closing a deal by moving it to its pipeline's won stage is a permanent no-op for them.
--
-- INFERENCE RULE. Per pipeline, and only for a pipeline whose stages are ALL still 'open':
--
--   won  = the single stage with probability = 100. A stage the legacy weighting scored at
--          100% contributes its full value to the forecast, which is only true once the
--          deal is closed and won. Two or more such stages is ambiguous, so nothing is
--          promoted. A stage that also reads as a loss (see below) is excluded, so a
--          mis-weighted "Lost" is never promoted to won.
--
--   lost = the single stage with probability = 0 whose name contains a loss word in one of
--          the five supported locales (lost / verloren / perdido / perdida / perdu /
--          perdue / perso / persa), matched case-insensitively on word boundaries so
--          "Closed Lost" counts and "Lostock Road" does not. Probability alone cannot
--          identify a loss: an early open stage is also worth 0%. Two or more matches is
--          ambiguous, so nothing is promoted. Names that merely suggest abandonment
--          ("Abandoned", "On hold", "Dormant") are deliberately NOT loss words — those
--          stages are routinely re-opened and are left as 'open'.
--
-- A pipeline is skipped entirely unless at least one stage would still be 'open' afterwards,
-- so a two-stage pipeline never becomes a pipeline no deal can enter.
--
-- IDEMPOTENCY. The "all stages still open" precondition is the guard. After a successful
-- run the affected pipeline holds a non-open stage and is never reconsidered, and a pipeline
-- the rule declined stays all-open but re-derives the same empty result. Any kind an
-- administrator has since set by hand also parks the pipeline, so this never overrides a
-- deliberate choice.

CREATE TEMP TABLE "_stage_kind_backfill" ON COMMIT DROP AS
WITH "shaped" AS (
  SELECT
    s."id",
    s."pipelineId",
    s."probability" = 100 AS "readsAsWon",
    s."probability" = 0
      AND s."name" ~* '\y(lost|verloren|perdido|perdida|perdu|perdue|perso|persa)\y' AS "readsAsLost"
  FROM "PipelineStage" s
  WHERE NOT EXISTS (
    SELECT 1 FROM "PipelineStage" other WHERE other."pipelineId" = s."pipelineId" AND other."kind" <> 'open'
  )
),
"wonPick" AS (
  SELECT "pipelineId", min("id") AS "stageId"
  FROM "shaped"
  WHERE "readsAsWon" AND NOT "readsAsLost"
  GROUP BY "pipelineId"
  HAVING count(*) = 1
),
"lostPick" AS (
  SELECT "pipelineId", min("id") AS "stageId"
  FROM "shaped"
  WHERE "readsAsLost" AND NOT "readsAsWon"
  GROUP BY "pipelineId"
  HAVING count(*) = 1
),
"planned" AS (
  SELECT
    p."pipelineId",
    w."stageId" AS "wonStageId",
    l."stageId" AS "lostStageId",
    p."stageCount",
    (w."stageId" IS NOT NULL)::int + (l."stageId" IS NOT NULL)::int AS "promotions"
  FROM (SELECT "pipelineId", count(*) AS "stageCount" FROM "shaped" GROUP BY "pipelineId") p
  LEFT JOIN "wonPick" w ON w."pipelineId" = p."pipelineId"
  LEFT JOIN "lostPick" l ON l."pipelineId" = p."pipelineId"
)
SELECT "pipelineId", "wonStageId", "lostStageId"
FROM "planned"
WHERE "promotions" > 0
  AND "stageCount" - "promotions" >= 1;

UPDATE "PipelineStage" s
SET "kind" = 'won', "updatedAt" = now()
FROM "_stage_kind_backfill" b
WHERE s."id" = b."wonStageId";

UPDATE "PipelineStage" s
SET "kind" = 'lost', "updatedAt" = now()
FROM "_stage_kind_backfill" b
WHERE s."id" = b."lostStageId";

-- Reads the staging table rather than the final state, so a re-run reports nothing instead
-- of re-reporting work an earlier run did. This lands in the PostgreSQL server log; the repo
-- bans console access in application code and a migration has no other logging channel.
DO $$
DECLARE
  "pipelines" bigint;
  "won" bigint;
  "lost" bigint;
BEGIN
  SELECT count(*), count("wonStageId"), count("lostStageId")
  INTO "pipelines", "won", "lost"
  FROM "_stage_kind_backfill";

  RAISE NOTICE 'stage kind backfill: % pipelines touched, % stages promoted to won, % to lost', "pipelines", "won", "lost";
END $$;
