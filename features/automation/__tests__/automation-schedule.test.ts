import { describe, expect, it } from "vitest";

import { AutomationTriggerKind, EntityType } from "@/generated/prisma";
import { DomainEvent } from "@/features/event/domain-events";

import { isSupportedAutomationSchedule, parseAutomationSchedule } from "../automation-schedule";
import { nextAutomationRunAt } from "../automation-next-run";
import { automationTriggerForEvent, changedFieldsMatch } from "../automation-trigger-map";

describe("the cron expression an automation schedule accepts", () => {
  it("expands each field to the values it fires on", () => {
    expect(parseAutomationSchedule("0 9 * * 1")).toEqual([[0], [9], expect.any(Array), expect.any(Array), [1]]);
  });

  it.each(["", "0 9 * *", "0 9 * * * *", "60 9 * * *", "0 24 * * *", "0 9 32 * *", "a b c d e"])(
    "refuses %s, which is not five valid fields",
    (expression) => {
      expect(parseAutomationSchedule(expression)).toBeNull();
    },
  );

  it("accepts a schedule that fires no more than four times an hour", () => {
    expect(isSupportedAutomationSchedule("0,15,30,45 * * * *")).toBe(true);
    expect(isSupportedAutomationSchedule("0 9 * * *")).toBe(true);
  });

  it("refuses a schedule that would fire more often than the sweep can serve it", () => {
    expect(isSupportedAutomationSchedule("* * * * *")).toBe(false);
    expect(isSupportedAutomationSchedule("0,5,10 * * * *")).toBe(false);
  });
});

describe("the instant a schedule next fires", () => {
  it("finds the next matching minute in UTC", () => {
    const next = nextAutomationRunAt("0 9 * * *", null, new Date("2026-03-10T08:30:00.000Z"));

    expect(next?.toISOString()).toBe("2026-03-10T09:00:00.000Z");
  });

  it("rolls to the following day once the hour has passed", () => {
    const next = nextAutomationRunAt("0 9 * * *", null, new Date("2026-03-10T09:30:00.000Z"));

    expect(next?.toISOString()).toBe("2026-03-11T09:00:00.000Z");
  });

  it("reads the wall clock of the zone the automation names", () => {
    const next = nextAutomationRunAt("0 9 * * *", "Europe/Berlin", new Date("2026-03-10T00:00:00.000Z"));

    expect(next?.toISOString()).toBe("2026-03-10T08:00:00.000Z");
  });

  it("answers nothing for an expression it cannot parse", () => {
    expect(nextAutomationRunAt("nonsense", null, new Date())).toBeNull();
  });
});

describe("the trigger an event resolves to", () => {
  it("maps a record event onto its entity type and kind", () => {
    expect(automationTriggerForEvent(DomainEvent.DEAL_UPDATED)).toEqual({
      entityType: EntityType.deal,
      triggerKind: AutomationTriggerKind.recordUpdated,
    });
  });

  it("resolves nothing for an event no automation can trigger on", () => {
    expect(automationTriggerForEvent(DomainEvent.WEBHOOK_CREATED)).toBeUndefined();
  });

  it("treats an empty changed-field list as every field", () => {
    expect(changedFieldsMatch([], ["name"])).toBe(true);
  });

  it("matches only when a declared field actually changed", () => {
    expect(changedFieldsMatch(["stageId"], ["name"])).toBe(false);
    expect(changedFieldsMatch(["stageId"], ["name", "stageId"])).toBe(true);
  });
});
