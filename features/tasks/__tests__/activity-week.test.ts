import { describe, expect, it } from "vitest";

import {
  activityWeekDayIndex,
  activityWeekDays,
  activityWeekRange,
  dropTargetForDueAt,
  dueAtForDropTarget,
  isWithinActivityWeek,
  layoutActivityWeek,
  neighbourDropTarget,
  parseWeekDropTarget,
  shiftActivityWeek,
  startOfActivityWeek,
  weekDropTargetId,
} from "../activity-week";

const monday = new Date(2026, 8, 21);
const at = (dayOffset: number, hours: number, minutes = 0) => new Date(2026, 8, 21 + dayOffset, hours, minutes);

describe("the activity week", () => {
  it("starts on Monday and spans seven calendar days", () => {
    expect(startOfActivityWeek(new Date(2026, 8, 24, 15, 30))).toEqual(monday);
    expect(startOfActivityWeek(new Date(2026, 8, 27, 23, 59))).toEqual(monday);
    expect(activityWeekDays(monday)).toHaveLength(7);
    expect(activityWeekRange(monday)).toEqual({ from: monday, to: new Date(2026, 8, 28) });
    expect(shiftActivityWeek(monday, 1)).toEqual(new Date(2026, 8, 28));
    expect(shiftActivityWeek(monday, -1)).toEqual(new Date(2026, 8, 14));
  });

  it("places a moment on its weekday and rejects moments outside the week", () => {
    expect(activityWeekDayIndex(at(2, 10), monday)).toBe(2);
    expect(activityWeekDayIndex(at(7, 0), monday)).toBeNull();
    expect(isWithinActivityWeek(at(6, 23, 59), monday)).toBe(true);
    expect(isWithinActivityWeek(at(7, 0), monday)).toBe(false);
    expect(isWithinActivityWeek(null, monday)).toBe(false);
  });
});

describe("layoutActivityWeek", () => {
  const activity = (id: string, dueAt: Date | null, durationMinutes: number | null = null) => ({
    id,
    dueAt,
    durationMinutes,
  });

  it("puts midnight activities in the all-day row and timed ones in their slot", () => {
    const layout = layoutActivityWeek(
      [activity("all-day", at(1, 0)), activity("meeting", at(2, 10), 30), activity("undated", null)],
      monday,
    );

    expect(layout.allDay[1].map((item) => item.id)).toEqual(["all-day"]);
    expect(layout.timed[2]).toEqual([
      expect.objectContaining({ dayIndex: 2, startMinutes: 600, endMinutes: 630, lane: 0, laneCount: 1 }),
    ]);
    expect(layout.timed.flat().some((entry) => entry.item.id === "undated")).toBe(false);
  });

  it("gives overlapping activities side-by-side lanes and uses the default duration", () => {
    const layout = layoutActivityWeek(
      [activity("a", at(3, 9), 90), activity("b", at(3, 9, 30), null), activity("c", at(3, 12), 30)],
      monday,
    );
    const byId = Object.fromEntries(layout.timed[3].map((entry) => [entry.item.id, entry]));

    expect(byId.a).toMatchObject({ lane: 0, laneCount: 2, endMinutes: 630 });
    expect(byId.b).toMatchObject({ lane: 1, laneCount: 2, startMinutes: 570, endMinutes: 600 });
    expect(byId.c).toMatchObject({ lane: 0, laneCount: 1 });
  });
});

describe("drop targets", () => {
  it("round-trips every target through its droppable id and refuses malformed ids", () => {
    for (const target of [
      { kind: "slot" as const, dayIndex: 4, minutes: 870 },
      { kind: "allDay" as const, dayIndex: 0 },
      { kind: "unscheduled" as const },
    ])
      expect(parseWeekDropTarget(weekDropTargetId(target))).toEqual(target);

    expect(parseWeekDropTarget("slot:7:0")).toBeNull();
    expect(parseWeekDropTarget("slot:1:15")).toBeNull();
    expect(parseWeekDropTarget("all-day:-1")).toBeNull();
    expect(parseWeekDropTarget("anything")).toBeNull();
  });

  it("turns a target into the due date the task gets, and back", () => {
    expect(dueAtForDropTarget({ kind: "slot", dayIndex: 3, minutes: 14 * 60 }, monday)).toEqual(at(3, 14));
    expect(dueAtForDropTarget({ kind: "allDay", dayIndex: 1 }, monday)).toEqual(at(1, 0));
    expect(dueAtForDropTarget({ kind: "unscheduled" }, monday)).toBeNull();

    expect(dropTargetForDueAt(at(3, 14, 20), monday)).toEqual({ kind: "slot", dayIndex: 3, minutes: 14 * 60 });
    expect(dropTargetForDueAt(at(1, 0), monday)).toEqual({ kind: "allDay", dayIndex: 1 });
    expect(dropTargetForDueAt(null, monday)).toEqual({ kind: "unscheduled" });
    expect(dropTargetForDueAt(at(9, 10), monday)).toBeNull();
  });

  it("moves one step at a time with the arrow keys and stops at the edges", () => {
    const slot = { kind: "slot" as const, dayIndex: 0, minutes: 0 };

    expect(neighbourDropTarget(slot, "up")).toEqual({ kind: "allDay", dayIndex: 0 });
    expect(neighbourDropTarget(slot, "down")).toEqual({ ...slot, minutes: 30 });
    expect(neighbourDropTarget(slot, "left")).toEqual(slot);
    expect(neighbourDropTarget({ ...slot, dayIndex: 6 }, "right")).toEqual({ ...slot, dayIndex: 6 });
    expect(neighbourDropTarget({ ...slot, minutes: 23 * 60 + 30 }, "down")).toEqual({ ...slot, minutes: 23 * 60 + 30 });
    expect(neighbourDropTarget({ kind: "allDay", dayIndex: 2 }, "up")).toEqual({ kind: "unscheduled" });
    expect(neighbourDropTarget({ kind: "unscheduled" }, "down")).toEqual({ kind: "allDay", dayIndex: 0 });
  });
});
