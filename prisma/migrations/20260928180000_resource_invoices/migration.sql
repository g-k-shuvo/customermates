-- Adds the invoices resource (PRD 10 W2-11). Alone in its migration because PostgreSQL will not
-- let a new enum value be used later in the transaction that added it; the next migration
-- grants it.
ALTER TYPE "Resource" ADD VALUE IF NOT EXISTS 'invoices';
