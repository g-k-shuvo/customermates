import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions", () => ({ getAutomationRunsAction: vi.fn() }));

import type { EntityType } from "@/generated/prisma";
import { AutomationRunStatus } from "@/generated/prisma";

import { runTriggerLabel, stepNeverRan } from "../automation-runs-modal";

describe("stepNeverRan", () => {
  it("reads a queued step of a skipped or cancelled run as never run", () => {
    expect(stepNeverRan(AutomationRunStatus.skipped, AutomationRunStatus.queued)).toBe(true);
    expect(stepNeverRan(AutomationRunStatus.cancelled, AutomationRunStatus.queued)).toBe(true);
  });

  it("keeps the step's own status while the run is live or once a step has run", () => {
    expect(stepNeverRan(AutomationRunStatus.queued, AutomationRunStatus.queued)).toBe(false);
    expect(stepNeverRan(AutomationRunStatus.running, AutomationRunStatus.queued)).toBe(false);
    expect(stepNeverRan(AutomationRunStatus.cancelled, AutomationRunStatus.succeeded)).toBe(false);
  });
});

describe("runTriggerLabel", () => {
  const t = (key: string, values?: Record<string, string>) => (values ? `${key}(${values.entity})` : key);
  const singular = (entityType: EntityType) => `term:${entityType}`;

  it("reads a record event as the trigger sentence for its record type", () => {
    expect(runTriggerLabel("deal.created", t, singular)).toBe("Automations.triggers.recordCreated(term:deal)");
    expect(runTriggerLabel("contact.updated", t, singular)).toBe("Automations.triggers.recordUpdated(term:contact)");
    expect(runTriggerLabel("task.deleted", t, singular)).toBe("Automations.triggers.recordDeleted(term:task)");
  });

  it("reads a run without an event as a scheduled run", () => {
    expect(runTriggerLabel(null, t, singular)).toBe("Automations.triggerKinds.schedule");
    expect(runTriggerLabel("schedule", t, singular)).toBe("Automations.triggerKinds.schedule");
  });

  it("keeps an event it cannot map rather than inventing a trigger", () => {
    expect(runTriggerLabel("invoice.created", t, singular)).toBe("invoice.created");
  });
});
