-- Adds the leads resource so lead administration can be permissioned ahead of the
-- features/leads slice that will use it.
--
-- This is deliberately alone in its own migration. PostgreSQL will not let a new enum
-- value be used by other statements in the transaction that added it, and Prisma wraps
-- each migration file in a single transaction — so the RolePermission rows that reference
-- 'leads' are granted by the next migration instead.
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'leads';
