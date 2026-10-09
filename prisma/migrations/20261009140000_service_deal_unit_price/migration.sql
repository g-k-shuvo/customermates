ALTER TABLE "ServiceDeal" ADD COLUMN "unitPrice" DOUBLE PRECISION;

UPDATE "ServiceDeal" AS sd
SET "unitPrice" = s."amount"
FROM "Service" AS s
WHERE s."id" = sd."serviceId" AND sd."unitPrice" IS NULL;
