-- Grants every existing non-system role the same pipeline permissions it already holds
-- for deals.
--
-- Without this the pipeline feature is invisible to every existing custom role: system
-- roles bypass permission checks, but custom roles are matched against explicit
-- RolePermission rows, and a resource with no rows is denied.
--
-- Guarded by NOT EXISTS so re-running is a no-op; CI applies migrations twice.
INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action", "createdAt")
SELECT gen_random_uuid(), rp."roleId", rp."companyId", 'pipelines', rp."action", now()
FROM "RolePermission" rp
WHERE rp."resource" = 'deals'
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" x
    WHERE x."roleId" = rp."roleId"
      AND x."resource" = 'pipelines'
      AND x."action" = rp."action"
  );
