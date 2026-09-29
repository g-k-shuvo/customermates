import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { EventService } from "../event.service";
import { DomainEvent } from "../domain-events";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { runInAutomationContext } from "@/core/decorators/automation-context";

const DEAL_ID = "00000000-0000-4000-8000-0000000000d1";
const AUTOMATION_A = "00000000-0000-4000-8000-0000000000a1";
const AUTOMATION_B = "00000000-0000-4000-8000-0000000000b1";
const AUTOMATION_C = "00000000-0000-4000-8000-0000000000c1";
const PARENT_RUN = "00000000-0000-4000-8000-0000000000e1";

describe("automation chaining", () => {
  let admit: ReturnType<typeof vi.fn>;
  let service: EventService;

  beforeEach(() => {
    admit = vi.fn().mockResolvedValue([]);
    service = new EventService(
      [],
      { getWebhooksForEvent: vi.fn().mockResolvedValue([]) } as never,
      { create: vi.fn().mockResolvedValue([]) } as never,
      { log: vi.fn().mockResolvedValue(undefined) } as never,
      { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
      {
        findEventRoutinesUnscoped: () => Promise.resolve([]),
        admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
      } as never,
      {
        matchesCurrentUser: vi.fn().mockResolvedValue(true),
        matchesUserUnscoped: vi.fn().mockResolvedValue(true),
        canUserAccessUnscoped: vi.fn().mockResolvedValue(true),
      } as never,
      {
        findEventAutomationsUnscoped: () =>
          Promise.resolve(
            [AUTOMATION_A, AUTOMATION_B, AUTOMATION_C].map((id) => ({ id, changedFields: [], conditions: null })),
          ),
        admitAutomationRunsUnscoped: admit,
      } as never,
    );
  });

  const publishDealUpdate = () =>
    runWithTenant(mockUser, () =>
      service.publish(DomainEvent.DEAL_UPDATED, {
        entityId: DEAL_ID,
        payload: { changes: { name: { previous: "A", current: "B" } } } as never,
      }),
    );

  it("admits every subscribed automation for a change a person made, with no causation", async () => {
    await publishDealUpdate();

    expect(admit).toHaveBeenCalledWith(
      expect.objectContaining({ automationIds: [AUTOMATION_A, AUTOMATION_B, AUTOMATION_C], causation: null }),
    );
  });

  it("lets an automation's change start the others, but never the automations already in the chain", async () => {
    await runInAutomationContext(
      { automationId: AUTOMATION_B, runId: PARENT_RUN, causationDepth: 2, causationChain: [AUTOMATION_A] },
      publishDealUpdate,
    );

    expect(admit).toHaveBeenCalledWith(
      expect.objectContaining({
        automationIds: [AUTOMATION_C],
        causation: { depth: 2, chain: [AUTOMATION_A, AUTOMATION_B], parentRunId: PARENT_RUN },
      }),
    );
  });

  it("admits nothing when the whole subscription is already in the chain", async () => {
    await runInAutomationContext(
      {
        automationId: AUTOMATION_C,
        runId: PARENT_RUN,
        causationDepth: 2,
        causationChain: [AUTOMATION_A, AUTOMATION_B],
      },
      publishDealUpdate,
    );

    expect(admit).not.toHaveBeenCalled();
  });

  it("stops at the third automation in a row", async () => {
    await runInAutomationContext(
      { automationId: AUTOMATION_C, runId: PARENT_RUN, causationDepth: 3, causationChain: [] },
      publishDealUpdate,
    );

    expect(admit).not.toHaveBeenCalled();
  });
});
