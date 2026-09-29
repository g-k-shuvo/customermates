-- Adds the campaigns resource (PRD 10 W3-18). Alone in its migration because PostgreSQL will not
-- let a new enum value be used later in the transaction that added it. No role is granted it:
-- sending campaigns stays with system roles until an admin grants it.
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'campaigns';
