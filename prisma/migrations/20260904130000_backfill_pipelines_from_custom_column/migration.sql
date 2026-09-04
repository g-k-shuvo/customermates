-- Backfill real pipelines and stages from the legacy deal-weighting custom column.
--
-- Before this release a company simulated pipeline stages with a singleSelect
-- CustomColumn nominated as Company."dealWeightingColumnId". Each option carried a
-- weight that drove Deal."weightedValue", and the kanban board grouped by that column.
--
-- This migration turns that arrangement into real Pipeline and PipelineStage rows and
-- points every Deal at the stage it was already in, so no board changes shape.
--
-- The legacy CustomColumn and Company."dealWeightingColumnId" are deliberately left in
-- place as the rollback path; they are retired in a later release.
--
-- Every statement is set-based and guarded so the whole file is idempotent: CI applies
-- migrations and seeds twice in the same job, and a second pass must be a no-op.

-- Transient mapping column. Stage rows remember which legacy option value they came
-- from so deals can be matched by their stored CustomFieldValue. Dropped at the end of
-- this migration, and never declared in schema.prisma.
ALTER TABLE "PipelineStage" ADD COLUMN "legacyOptionValue" TEXT;

-- Step A: one pipeline per company that nominated a weighting column, named after it.
INSERT INTO "Pipeline" ("id", "companyId", "name", "position", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", cc."label", 0, true, now(), now()
FROM "Company" c
JOIN "CustomColumn" cc ON cc."id" = c."dealWeightingColumnId" AND cc."companyId" = c."id"
WHERE NOT EXISTS (SELECT 1 FROM "Pipeline" p WHERE p."companyId" = c."id");

-- Step B: companies with no weighting column get a default "Sales" pipeline.
INSERT INTO "Pipeline" ("id", "companyId", "name", "position", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", 'Sales', 0, true, now(), now()
FROM "Company" c
WHERE c."dealWeightingColumnId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Pipeline" p WHERE p."companyId" = c."id");

-- Step C: one stage per stored option, preserving the stored order.
--
-- Mirrors readOptionWeights (features/deals/deal-weighting.ts): an option is only usable
-- when its "value" is a JSON string. Unlike readOptionWeights, an option whose "weight" is
-- absent or non-numeric still becomes a stage — at probability 0 — because a missing stage
-- would strand every deal sitting on that option.
INSERT INTO "PipelineStage" ("id", "companyId", "pipelineId", "name", "position", "probability", "kind", "legacyOptionValue", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  p."companyId",
  p."id",
  COALESCE(NULLIF(o."elem"->>'label', ''), o."elem"->>'value'),
  (o."ord" - 1)::int,
  CASE WHEN jsonb_typeof(o."elem"->'weight') = 'number' THEN (o."elem"->>'weight')::double precision ELSE 0 END,
  'open',
  o."elem"->>'value',
  now(),
  now()
FROM "Pipeline" p
JOIN "Company" c ON c."id" = p."companyId"
JOIN "CustomColumn" cc ON cc."id" = c."dealWeightingColumnId" AND cc."companyId" = c."id"
CROSS JOIN LATERAL jsonb_array_elements(cc."options"::jsonb->'options') WITH ORDINALITY AS o("elem", "ord")
WHERE jsonb_typeof(o."elem"->'value') = 'string'
  AND NOT EXISTS (SELECT 1 FROM "PipelineStage" s WHERE s."pipelineId" = p."id");

-- Step D: pipelines with no legacy options get a single "Open" stage at probability 0.
INSERT INTO "PipelineStage" ("id", "companyId", "pipelineId", "name", "position", "probability", "kind", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."companyId", p."id", 'Open', 0, 0, 'open', now(), now()
FROM "Pipeline" p
WHERE NOT EXISTS (SELECT 1 FROM "PipelineStage" s WHERE s."pipelineId" = p."id");

-- Step E: place every deal. Deals whose stored option matches a stage land on that stage;
-- unmatched or empty values fall back to the pipeline's first stage, as the spec requires.
--
-- "pipelineId" IS NULL is both the idempotency guard and the reason this needs no batching:
-- the work happens server-side and no deal row is ever loaded into application memory.
CREATE TEMP TABLE "_pipeline_backfill" ON COMMIT DROP AS
  SELECT
    d."id" AS "dealId",
    d."companyId" AS "companyId",
    p."id" AS "pipelineId",
    COALESCE(matched."id", fallback."id") AS "stageId",
    d."updatedAt" AS "enteredAt",
    (cfv."value" IS NOT NULL AND matched."id" IS NULL) AS "unmatched"
  FROM "Deal" d
  JOIN LATERAL (
    SELECT p2."id"
    FROM "Pipeline" p2
    WHERE p2."companyId" = d."companyId"
    ORDER BY p2."isDefault" DESC, p2."position", p2."id"
    LIMIT 1
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT s."id"
    FROM "PipelineStage" s
    WHERE s."pipelineId" = p."id"
    ORDER BY s."position", s."id"
    LIMIT 1
  ) fallback ON true
  LEFT JOIN "Company" c ON c."id" = d."companyId"
  LEFT JOIN "CustomFieldValue" cfv
    ON cfv."dealId" = d."id"
   AND cfv."columnId" = c."dealWeightingColumnId"
  LEFT JOIN "PipelineStage" matched
    ON matched."pipelineId" = p."id"
   AND matched."legacyOptionValue" = cfv."value"
  WHERE d."pipelineId" IS NULL;

UPDATE "Deal" d
SET "pipelineId" = a."pipelineId",
    "stageId" = a."stageId",
    "stageEnteredAt" = a."enteredAt",
    "status" = 'open'
FROM "_pipeline_backfill" a
WHERE a."dealId" = d."id";

-- Per-company summary of what THIS run migrated. Reads the staging table rather than the
-- final state, so a re-run correctly reports nothing instead of re-reporting old work.
-- This lands in the PostgreSQL server log; the repo bans console access in application
-- code, and a migration has no other logging channel.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT "companyId",
           count(*) AS "migrated",
           count(*) FILTER (WHERE "unmatched") AS "unmatched"
    FROM "_pipeline_backfill"
    GROUP BY "companyId"
  LOOP
    RAISE NOTICE 'pipeline backfill: company % migrated % deals, % unmatched option values', r."companyId", r."migrated", r."unmatched";
  END LOOP;
END $$;

ALTER TABLE "PipelineStage" DROP COLUMN "legacyOptionValue";
