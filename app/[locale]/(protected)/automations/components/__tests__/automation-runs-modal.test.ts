import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions", () => ({ getAutomationRunsAction: vi.fn() }));

import { AutomationRunStatus } from "@/generated/prisma";

import { stepNeverRan } from "../automation-runs-modal";

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
