-- A per-source request counter for the public web form endpoint.
--
-- The endpoint is unauthenticated and will be found by scanners, and nothing else in this
-- codebase rate limits anything: better-auth guards its own routes and explicitly disables
-- the limiter for API keys, so there was nothing to reuse.
--
-- The counter keys on the source rather than the slug so it carries a companyId like every
-- other tenant table. That means an unknown slug is not counted, which is deliberate: such
-- a request costs one indexed lookup and a 404, while a known slug can cost a signature
-- verification and a payload write.
--
-- Every statement is guarded so the file is safe to re-run; CI applies migrations twice.

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebFormRateLimit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebFormRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WebFormRateLimit_sourceId_key" ON "WebFormRateLimit"("sourceId");
CREATE INDEX IF NOT EXISTS "WebFormRateLimit_companyId_idx" ON "WebFormRateLimit"("companyId");
CREATE INDEX IF NOT EXISTS "WebFormRateLimit_windowStart_idx" ON "WebFormRateLimit"("windowStart");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "WebFormRateLimit" ADD CONSTRAINT "WebFormRateLimit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "WebFormRateLimit" ADD CONSTRAINT "WebFormRateLimit_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "WebFormSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
