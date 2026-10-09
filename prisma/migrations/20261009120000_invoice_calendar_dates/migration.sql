ALTER TABLE "Invoice" ALTER COLUMN "issueDate" SET DATA TYPE DATE USING "issueDate"::date;
ALTER TABLE "Invoice" ALTER COLUMN "dueDate" SET DATA TYPE DATE USING "dueDate"::date;
