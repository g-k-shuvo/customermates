-- Seed the five starter lost reasons for every company that already exists.
--
-- Company creation seeds these for NEW companies only, so without this data migration
-- every tenant created before the previous migration would open the lost-reason picker
-- on an empty list and be unable to close a deal as lost.
--
-- Idempotent by design: CI applies migrations and seeds twice in the same job, and a
-- second pass must be a no-op. The guard is per company rather than per name, so a
-- tenant that renamed or deleted a starter reason keeps its own list — a re-run never
-- resurrects a reason someone deliberately removed.
--
-- Set-based, so no row is ever loaded into application memory. Plain DDL-free SQL and
-- gen_random_uuid() from core PostgreSQL, so this applies unchanged on 16 and 17.

INSERT INTO "LostReason" ("id", "companyId", "name", "position", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", r."name", r."position", now(), now()
FROM "Company" c
CROSS JOIN (
  VALUES
    ('Price', 0),
    ('Lost to competitor', 1),
    ('No budget', 2),
    ('No decision', 3),
    ('Bad timing', 4)
) AS r("name", "position")
WHERE NOT EXISTS (
  SELECT 1 FROM "LostReason" l WHERE l."companyId" = c."id"
);
