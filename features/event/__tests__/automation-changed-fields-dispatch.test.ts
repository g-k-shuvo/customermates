import { beforeEach, describe, expect, it, vi } from "vitest";

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

const DEAL_ID = "00000000-0000-4000-8000-000000000011";
const WATCHING_ID = "00000000-0000-4000-8000-0000000000c1";
const UNFILTERED_ID = "00000000-0000-4000-8000-0000000000c2";

type Candidate = { id: string; changedFields: string[]; conditions: null };

describe("automation dispatch filters on changed fields and fails closed", () => {
  let candidates: Candidate[];
  let automationRepo: {
    findEventAutomationsUnscoped: ReturnType<typeof vi.fn>;
    admitAutomationRunsUnscoped: ReturnType<typeof vi.fn>;
  };
  let backgroundTaskService: { dispatch: ReturnType<typeof vi.fn> };
  let service: EventService;

  beforeEach(() => {
    vi.clearAllMocks();
    candidates = [];
    automationRepo = {
      findEventAutomationsUnscoped: vi.fn(() => Promise.resolve(candidates)),
      admitAutomationRunsUnscoped: vi.fn(({ automationIds }: { automationIds: string[] }) =>
        Promise.resolve(automationIds.map((automationId) => ({ id: `run-${automationId}`, automationId }))),
      ),
    };
    backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    service = new EventService(
      [],
      { getWebhooksForEvent: vi.fn().mockResolvedValue([]) } as never,
      { create: vi.fn().mockResolvedValue([]) } as never,
      { log: vi.fn().mockResolvedValue(undefined) } as never,
      backgroundTaskService as never,
      {
        findEventRoutinesUnscoped: () => Promise.resolve([]),
        admitEventRoutineRunsUnscoped: () => Promise.resolve([]),
      } as never,
      { matchesUserUnscoped: vi.fn().mockResolvedValue(true) } as never,
      automationRepo as never,
    );
  });

  function watch(...changedFields: string[]): Candidate {
    return { id: WATCHING_ID, changedFields, conditions: null };
  }

  function admittedIds(): string[] {
    return automationRepo.admitAutomationRunsUnscoped.mock.calls.flatMap(
      (call) => (call[0] as { automationIds: string[] }).automationIds,
    );
  }

  function publish(event: DomainEvent, payload: Record<string, unknown>) {
    return runWithTenant(mockUser, () => service.publish(event, { entityId: DEAL_ID, payload } as never));
  }

  it("does not fire an automation that watches a field on an event that carries no changes", async () => {
    candidates = [watch("name")];

    await publish(DomainEvent.DEAL_CREATED, { id: DEAL_ID, name: "Acme" });

    expect(automationRepo.findEventAutomationsUnscoped).toHaveBeenCalledTimes(1);
    expect(automationRepo.admitAutomationRunsUnscoped).not.toHaveBeenCalled();
    expect(backgroundTaskService.dispatch).not.toHaveBeenCalledWith("run-automation", expect.anything());
  });

  it("does not fire it on an update event whose payload carries no change record", async () => {
    candidates = [watch("name")];

    await publish(DomainEvent.DEAL_UPDATED, { deal: { id: DEAL_ID, name: "Acme" } });

    expect(automationRepo.admitAutomationRunsUnscoped).not.toHaveBeenCalled();
  });

  it("does not fire it when the update changed only other fields", async () => {
    candidates = [watch("name")];

    await publish(DomainEvent.DEAL_UPDATED, {
      deal: { id: DEAL_ID },
      changes: { probability: { previous: 10, current: 50 } },
    });

    expect(automationRepo.admitAutomationRunsUnscoped).not.toHaveBeenCalled();
  });

  it("fires it when a field it watches changed, and dispatches the run", async () => {
    candidates = [watch("probability", "name")];

    await publish(DomainEvent.DEAL_UPDATED, {
      deal: { id: DEAL_ID },
      changes: { name: { previous: "Acme", current: "Acme GmbH" } },
    });

    expect(admittedIds()).toEqual([WATCHING_ID]);
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("run-automation", {
      automationRunId: `run-${WATCHING_ID}`,
      companyId: mockUser.companyId,
    });
  });

  it("fires it when a custom field it watches changed, named by column id", async () => {
    const columnId = "00000000-0000-4000-8000-0000000000d1";
    candidates = [watch(columnId)];

    await publish(DomainEvent.DEAL_UPDATED, {
      deal: { id: DEAL_ID },
      changes: { customFieldValues: { previous: [], current: [{ columnId, value: "gold" }] } },
    });

    expect(admittedIds()).toEqual([WATCHING_ID]);
  });

  it("still fires an automation that watches no fields on an event without changes", async () => {
    candidates = [watch("name"), { id: UNFILTERED_ID, changedFields: [], conditions: null }];

    await publish(DomainEvent.DEAL_CREATED, { id: DEAL_ID, name: "Acme" });

    expect(admittedIds()).toEqual([UNFILTERED_ID]);
  });
});
