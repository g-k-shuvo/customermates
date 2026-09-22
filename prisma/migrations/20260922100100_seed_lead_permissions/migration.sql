-- Grants every existing non-system role the same lead permissions it already holds for
-- contacts.
--
-- Without this the lead feature is invisible to every existing custom role: system roles
-- bypass permission checks, but custom roles are matched against explicit RolePermission
-- rows, and a resource with no rows is denied.
--
-- Contacts rather than deals is the source: a lead is an unqualified inbound record, so
-- whoever may already see and edit contacts is the audience for it. A role that manages
-- deals but not contacts does not inherit leads, which is the conservative direction.
--
-- Guarded by NOT EXISTS so re-running is a no-op; CI applies migrations twice.
INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action", "createdAt")
SELECT gen_random_uuid(), rp."roleId", rp."companyId", 'leads', rp."action", now()
FROM "RolePermission" rp
WHERE rp."resource" = 'contacts'
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" x
    WHERE x."roleId" = rp."roleId"
      AND x."resource" = 'leads'
      AND x."action" = rp."action"
  );
