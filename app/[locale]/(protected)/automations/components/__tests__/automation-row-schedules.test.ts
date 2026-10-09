import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../actions", () => ({ deleteAutomationAction: vi.fn(), upsertAutomationAction: vi.fn() }));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: vi.fn() }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: (entityType: string) => entityType }),
}));

import { AutomationTriggerKind, EntityType } from "@/generated/prisma";

import { AutomationRow } from "../automation-row";

function render(triggerKind: AutomationTriggerKind, schedulesEnabled: boolean) {
  const automation = {
    id: "00000000-0000-4000-8000-0000000000c1",
    name: "Nightly",
    enabled: true,
    triggerKind,
    entityType: triggerKind === AutomationTriggerKind.schedule ? null : EntityType.deal,
    steps: [],
  } as never;

  return renderToStaticMarkup(
    createElement(AutomationRow, {
      automation,
      schedulesEnabled,
      onChanged: vi.fn(),
      onEdit: vi.fn(),
      onShowRuns: vi.fn(),
    }),
  );
}

describe("AutomationRow and the instance schedule switch", () => {
  it("marks a scheduled automation that cannot run on this installation", () => {
    expect(render(AutomationTriggerKind.schedule, false)).toContain("Automations.schedulesOff");
  });

  it("shows no mark when schedules run, or for record triggers", () => {
    expect(render(AutomationTriggerKind.schedule, true)).not.toContain("Automations.schedulesOff");
    expect(render(AutomationTriggerKind.recordCreated, false)).not.toContain("Automations.schedulesOff");
  });
});
