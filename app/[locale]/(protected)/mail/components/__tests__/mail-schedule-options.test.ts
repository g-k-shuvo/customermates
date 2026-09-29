import { describe, expect, it } from "vitest";

import { followUpDateFor, isFollowUpDue, sendLaterDateFor } from "../mail-schedule-options";

const WEDNESDAY_AFTERNOON = new Date(2026, 8, 30, 15, 20);

describe("mail schedule options", () => {
  it("puts follow-ups at 8:00 on the chosen day", () => {
    expect(followUpDateFor("tomorrow", WEDNESDAY_AFTERNOON)).toEqual(new Date(2026, 9, 1, 8, 0));
    expect(followUpDateFor("threeDays", WEDNESDAY_AFTERNOON)).toEqual(new Date(2026, 9, 3, 8, 0));
    expect(followUpDateFor("week", WEDNESDAY_AFTERNOON)).toEqual(new Date(2026, 9, 7, 8, 0));
  });

  it("sends later in an hour, tomorrow morning or next Monday morning", () => {
    expect(sendLaterDateFor("inHour", WEDNESDAY_AFTERNOON)).toEqual(new Date(2026, 8, 30, 16, 20));
    expect(sendLaterDateFor("tomorrowMorning", WEDNESDAY_AFTERNOON)).toEqual(new Date(2026, 9, 1, 8, 0));
    expect(sendLaterDateFor("mondayMorning", WEDNESDAY_AFTERNOON)).toEqual(new Date(2026, 9, 5, 8, 0));
  });

  it("calls a follow-up due once its time has come", () => {
    expect(isFollowUpDue(null, WEDNESDAY_AFTERNOON)).toBe(false);
    expect(isFollowUpDue(new Date(2026, 8, 30, 15, 20), WEDNESDAY_AFTERNOON)).toBe(true);
    expect(isFollowUpDue(new Date(2026, 8, 30, 15, 21), WEDNESDAY_AFTERNOON)).toBe(false);
  });
});
