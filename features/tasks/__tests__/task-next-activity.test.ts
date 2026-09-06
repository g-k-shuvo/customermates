import type { NextActivityCandidate, ScheduledActivity } from "../task-next-activity";

import { describe, expect, it } from "vitest";

import { ActivityKind } from "@/generated/prisma";

import { comesFirst, nextActivityOf, selectNextActivities } from "../task-next-activity";

const DEAL_A = "00000000-0000-4000-8000-0000000000a1";
const DEAL_B = "00000000-0000-4000-8000-0000000000b1";

const NOW = new Date("2026-09-06T12:00:00.000Z");

function candidate(overrides: Partial<NextActivityCandidate> = {}): NextActivityCandidate {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Call Bob",
    activityKind: ActivityKind.call,
    dueAt: new Date("2026-09-08T09:00:00.000Z"),
    createdAt: new Date("2026-09-01T09:00:00.000Z"),
    dealIds: [DEAL_A],
    ...overrides,
  };
}

describe("selectNextActivities", () => {
  it("returns the earliest due activity for each deal", () => {
    const later = candidate({
      id: "00000000-0000-4000-8000-000000000002",
      dueAt: new Date("2026-09-10T09:00:00.000Z"),
    });
    const earlier = candidate({ id: "00000000-0000-4000-8000-000000000003" });

    const selected = selectNextActivities([later, earlier], NOW);

    expect(selected.get(DEAL_A)?.id).toBe(earlier.id);
  });

  it("breaks a shared due date on the older creation time", () => {
    const dueAt = new Date("2026-09-08T09:00:00.000Z");
    const newer = candidate({
      id: "00000000-0000-4000-8000-00000000000a",
      dueAt,
      createdAt: new Date("2026-09-03T09:00:00.000Z"),
    });
    const older = candidate({
      id: "00000000-0000-4000-8000-00000000000b",
      dueAt,
      createdAt: new Date("2026-09-02T09:00:00.000Z"),
    });

    expect(selectNextActivities([newer, older], NOW).get(DEAL_A)?.id).toBe(older.id);
    expect(selectNextActivities([older, newer], NOW).get(DEAL_A)?.id).toBe(older.id);
  });

  it("breaks a shared due date and creation time on the lower id, whatever the input order", () => {
    const dueAt = new Date("2026-09-08T09:00:00.000Z");
    const createdAt = new Date("2026-09-02T09:00:00.000Z");
    const first = candidate({ id: "00000000-0000-4000-8000-000000000001", dueAt, createdAt });
    const second = candidate({ id: "00000000-0000-4000-8000-000000000002", dueAt, createdAt });

    expect(selectNextActivities([second, first], NOW).get(DEAL_A)?.id).toBe(first.id);
    expect(selectNextActivities([first, second], NOW).get(DEAL_A)?.id).toBe(first.id);
    expect(comesFirst(second, first)).toBe(false);
    expect(comesFirst(first, second)).toBe(true);
  });

  it("gives an activity shared by two deals to both of them", () => {
    const shared = candidate({ dealIds: [DEAL_A, DEAL_B] });

    const selected = selectNextActivities([shared], NOW);

    expect(selected.get(DEAL_A)?.id).toBe(shared.id);
    expect(selected.get(DEAL_B)?.id).toBe(shared.id);
  });

  it("picks each deal's own earliest activity independently", () => {
    const forA = candidate({
      id: "00000000-0000-4000-8000-000000000011",
      dueAt: new Date("2026-09-09T09:00:00.000Z"),
      dealIds: [DEAL_A],
    });
    const forB = candidate({
      id: "00000000-0000-4000-8000-000000000012",
      dueAt: new Date("2026-09-07T09:00:00.000Z"),
      dealIds: [DEAL_B],
    });

    const selected = selectNextActivities([forA, forB], NOW);

    expect(selected.get(DEAL_A)?.id).toBe(forA.id);
    expect(selected.get(DEAL_B)?.id).toBe(forB.id);
  });

  it("marks a next activity whose due moment has passed as overdue", () => {
    const overdue = candidate({ dueAt: new Date("2026-09-05T09:00:00.000Z") });

    expect(selectNextActivities([overdue], NOW).get(DEAL_A)).toEqual({
      id: overdue.id,
      name: overdue.name,
      activityKind: ActivityKind.call,
      dueAt: overdue.dueAt,
      isOverdue: true,
    });
  });

  it("leaves deals without an incomplete dated activity out of the result", () => {
    expect(selectNextActivities([], NOW).has(DEAL_A)).toBe(false);
  });
});

describe("nextActivityOf", () => {
  function scheduled(overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
    return {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Call Bob",
      activityKind: ActivityKind.call,
      dueAt: new Date("2026-09-08T09:00:00.000Z"),
      completedAt: null,
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
      ...overrides,
    };
  }

  it("returns the earliest incomplete dated activity", () => {
    const later = scheduled({
      id: "00000000-0000-4000-8000-000000000002",
      dueAt: new Date("2026-09-10T09:00:00.000Z"),
    });
    const earlier = scheduled({ id: "00000000-0000-4000-8000-000000000003" });

    expect(nextActivityOf([later, earlier], NOW)?.id).toBe(earlier.id);
  });

  it("ignores completed and undated activities", () => {
    const done = scheduled({ completedAt: new Date("2026-09-05T09:00:00.000Z") });
    const undated = scheduled({ id: "00000000-0000-4000-8000-000000000004", dueAt: null });

    expect(nextActivityOf([done, undated], NOW)).toBeNull();
  });

  it("flags a next activity whose due moment has passed", () => {
    const overdue = scheduled({ dueAt: new Date("2026-09-05T09:00:00.000Z") });

    expect(nextActivityOf([overdue], NOW)?.isOverdue).toBe(true);
  });
});
