import { describe, expect, it } from "vitest";

import { agendaBucketFor, compareByDueDate, groupAgenda, localDaysBetween } from "../activity-agenda";

const NOW = new Date(2026, 8, 6, 12, 0, 0);

function entry(dueAt: Date | null, completedAt: Date | null = null) {
  return { dueAt, completedAt };
}

describe("agendaBucketFor", () => {
  it("puts an undated activity in its own trailing bucket rather than dropping it", () => {
    expect(agendaBucketFor(entry(null), NOW)).toBe("undated");
  });

  it("calls an incomplete activity overdue at the due moment and after it", () => {
    expect(agendaBucketFor(entry(new Date(2026, 8, 6, 12, 0, 0)), NOW)).toBe("overdue");
    expect(agendaBucketFor(entry(new Date(2026, 8, 5, 9, 0, 0)), NOW)).toBe("overdue");
  });

  it("keeps a completed activity out of the overdue bucket and in its own day", () => {
    expect(agendaBucketFor(entry(new Date(2026, 8, 5, 9, 0, 0), new Date(2026, 8, 5, 10, 0, 0)), NOW)).toBe("today");
  });

  it("separates the rest of today, tomorrow, the coming week and later", () => {
    expect(agendaBucketFor(entry(new Date(2026, 8, 6, 18, 0, 0)), NOW)).toBe("today");
    expect(agendaBucketFor(entry(new Date(2026, 8, 7, 8, 0, 0)), NOW)).toBe("tomorrow");
    expect(agendaBucketFor(entry(new Date(2026, 8, 8, 8, 0, 0)), NOW)).toBe("thisWeek");
    expect(agendaBucketFor(entry(new Date(2026, 8, 12, 23, 0, 0)), NOW)).toBe("thisWeek");
    expect(agendaBucketFor(entry(new Date(2026, 8, 13, 0, 30, 0)), NOW)).toBe("later");
  });

  it("counts whole local days rather than elapsed hours", () => {
    expect(localDaysBetween(NOW, new Date(2026, 8, 7, 0, 30, 0))).toBe(1);
    expect(localDaysBetween(NOW, new Date(2026, 8, 6, 23, 59, 0))).toBe(0);
  });
});

describe("groupAgenda", () => {
  it("emits only the buckets that hold something, in agenda order", () => {
    const groups = groupAgenda(
      [
        entry(new Date(2026, 8, 20, 9, 0, 0)),
        entry(new Date(2026, 8, 5, 9, 0, 0)),
        entry(new Date(2026, 8, 7, 9, 0, 0)),
      ],
      NOW,
    );

    expect(groups.map((group) => group.bucket)).toEqual(["overdue", "tomorrow", "later"]);
  });

  it("sorts each bucket by due date, earliest first", () => {
    const late = entry(new Date(2026, 8, 8, 18, 0, 0));
    const early = entry(new Date(2026, 8, 8, 9, 0, 0));

    const [group] = groupAgenda([late, early], NOW);

    expect(group.items).toEqual([early, late]);
  });

  it("orders an undated activity after every dated one", () => {
    expect(compareByDueDate(entry(null), entry(new Date(2026, 8, 8, 9, 0, 0)))).toBeGreaterThan(0);
  });
});
