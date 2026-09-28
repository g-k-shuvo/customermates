-- Automation run hygiene (PRD 10 W3-01): each run step keeps the kind and config its step had when
-- the run was admitted, so editing or deleting an automation no longer changes or drops the steps
-- of runs already queued or waiting. The backfill copies the live step for existing rows and only
-- touches rows without a snapshot, so a re-run changes nothing.
ALTER TABLE "AutomationRunStep" ADD COLUMN "snapshot" JSONB;

UPDATE "AutomationRunStep" AS rs
SET "snapshot" = jsonb_build_object('kind', s."kind"::text, 'config', s."config")
FROM "AutomationStep" AS s
WHERE rs."stepId" = s."id" AND rs."snapshot" IS NULL;
