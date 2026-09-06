-- Activities on Task: a scheduled kind, a due instant, a duration and a completion stamp.
--
-- Task is extended rather than paralleled by an Activity model because Task already owns the
-- five join tables the CRM needs (TaskUser, TaskContact, TaskOrganization, TaskDeal,
-- TaskService), the RBAC Resource.tasks and twelve REST operations. "activityKind" is
-- NULLABLE so every task written before this migration stays valid without a backfill:
-- a task with no kind is a plain to-do, exactly what it was yesterday.
--
-- INDEXES. The PRD proposed Task(companyId, dueAt), Task(companyId, completedAt) and
-- Task(relatedUserId, dueAt). Two of those three do not serve any predicate this feature
-- actually issues, so they are not what this migration creates.
--
--   1. Task(companyId, completedAt, dueAt) — overdue.
--      Overdue is one predicate, not two: "completedAt IS NULL AND dueAt <= now()". Two
--      separate single-column indexes cannot serve it; Postgres would have to pick one and
--      re-check the other against the heap, or BitmapAnd two large ranges. This composite
--      matches the shape the predicate has — equality on the tenant, equality (IS NULL) on
--      completion, range on the due instant, range column last — so the scan starts at
--      the first incomplete task and stops at now(). The same index also orders the agenda,
--      which is "incomplete, by dueAt": (companyId, completedAt) fix the prefix, leaving
--      dueAt already sorted, so the agenda pages without a sort node.
--
--   2. Task(companyId, dueAt) — the due-date sort over all tasks.
--      dueAt becomes a sortable field on the tasks data view, where completion is not
--      constrained. Index 1 cannot serve that sort: its completedAt prefix is not fixed, so
--      dueAt is not globally ordered under it. Sorting by completedAt does not need a third
--      index — (companyId, completedAt) is a prefix of index 1.
--
--   3. Task(completedById) — referential maintenance, not a query.
--      The new FK is ON DELETE SET NULL, so deleting a user makes Postgres find every task
--      that user completed. Unindexed, that is a sequential scan of Task per deleted user,
--      and deleting a workspace deletes its users one by one. Task(relatedUserId) exists for
--      the same reason.
--
-- NO INDEX LEADING ON relatedUserId. The PRD's Task(relatedUserId, dueAt) would never be
-- read. relatedUserId is written only by the system-task listener, for userPendingAuthorization
-- tasks, and those never carry a due date — every row the index could contain has dueAt NULL.
-- Per-user filtering of activities runs through the TaskUser assignment table instead, and
-- needs nothing new: the assignee probe for a task already resolves index-only against the
-- existing unique TaskUser(taskId, userId).
--
-- Plain DDL and no data movement, so it applies unchanged on PostgreSQL 16 and 17. The column
-- and index statements are guarded, so re-running the file is a no-op.

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('call', 'meeting', 'email', 'task', 'deadline', 'lunch');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "activityKind" "ActivityKind",
ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER,
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_companyId_completedAt_dueAt_idx" ON "Task"("companyId", "completedAt", "dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_companyId_dueAt_idx" ON "Task"("companyId", "dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_completedById_idx" ON "Task"("completedById");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
