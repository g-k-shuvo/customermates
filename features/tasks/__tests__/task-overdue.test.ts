import { describe, expect, it } from "vitest";

import { isOverdue, notOverdueWhere, overdueWhere } from "../task-overdue";

const DUE_AT = new Date("2026-09-06T15:00:00.000Z");

describe("isOverdue", () => {
  it("treats a task as overdue exactly at the due moment", () => {
    expect(isOverdue(DUE_AT, null, new Date(DUE_AT))).toBe(true);
  });

  it("leaves a task on track one millisecond before the due moment", () => {
    expect(isOverdue(DUE_AT, null, new Date(DUE_AT.getTime() - 1))).toBe(false);
  });

  it("keeps a task overdue one millisecond after the due moment", () => {
    expect(isOverdue(DUE_AT, null, new Date(DUE_AT.getTime() + 1))).toBe(true);
  });

  it("never calls a completed task overdue, even long past its due moment", () => {
    expect(isOverdue(DUE_AT, new Date("2026-09-06T14:00:00.000Z"), new Date("2026-12-01T00:00:00.000Z"))).toBe(false);
  });

  it("never calls a task without a due date overdue", () => {
    expect(isOverdue(null, null, new Date("2026-12-01T00:00:00.000Z"))).toBe(false);
  });

  it("stays false when a task is completed at the very moment it falls due", () => {
    expect(isOverdue(DUE_AT, DUE_AT, DUE_AT)).toBe(false);
  });
});

describe("overdue query clauses", () => {
  it("asks for incomplete tasks whose due moment has arrived", () => {
    expect(overdueWhere(DUE_AT)).toEqual({ completedAt: null, dueAt: { lte: DUE_AT } });
  });

  it("covers completed, undated and not-yet-due tasks as the complement", () => {
    expect(notOverdueWhere(DUE_AT)).toEqual({
      OR: [{ completedAt: { not: null } }, { dueAt: null }, { dueAt: { gt: DUE_AT } }],
    });
  });
});
