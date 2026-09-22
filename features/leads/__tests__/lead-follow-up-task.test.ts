import { describe, expect, it, vi } from "vitest";

import {
  LEAD_FOLLOW_UP_BUSINESS_DAYS,
  LEAD_FOLLOW_UP_HOUR,
  leadFollowUpDueAt,
} from "../listener/lead-created-follow-up-task.listener";

vi.mock("@/core/di", () => ({}));

describe("lead follow-up due date", () => {
  it("falls on the next day when the lead arrives midweek", () => {
    const tuesday = new Date("2026-09-22T14:30:00");

    expect(leadFollowUpDueAt(tuesday).getDate()).toBe(23);
  });

  it("skips the weekend, so a Friday lead is due on Monday", () => {
    const friday = new Date("2026-09-25T16:00:00");
    const due = leadFollowUpDueAt(friday);

    expect(due.getDay()).toBe(1);
    expect(due.getDate()).toBe(28);
  });

  it("skips the weekend from a Saturday too", () => {
    const saturday = new Date("2026-09-26T10:00:00");

    expect(leadFollowUpDueAt(saturday).getDay()).toBe(1);
  });

  it("normalises the time of day, so a 23:59 lead is not due at 23:59", () => {
    const late = new Date("2026-09-22T23:59:59.999");
    const due = leadFollowUpDueAt(late);

    expect(due.getHours()).toBe(LEAD_FOLLOW_UP_HOUR);
    expect(due.getMinutes()).toBe(0);
    expect(due.getSeconds()).toBe(0);
    expect(due.getMilliseconds()).toBe(0);
  });

  it("always lands in the future", () => {
    const now = new Date("2026-09-22T08:00:00");

    expect(leadFollowUpDueAt(now).getTime()).toBeGreaterThan(now.getTime());
  });

  it("uses a single business day, which is the promise the copy makes", () => {
    expect(LEAD_FOLLOW_UP_BUSINESS_DAYS).toBe(1);
  });
});
