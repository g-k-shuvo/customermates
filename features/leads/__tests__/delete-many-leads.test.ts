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

import { DeleteManyLeadsInteractor, DeleteManyLeadsSchema } from "../delete/delete-many-leads.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const LEAD_1 = "00000000-0000-4000-8000-000000000101";
const LEAD_2 = "00000000-0000-4000-8000-000000000102";

describe("DeleteManyLeadsInteractor", () => {
  let repo: { getOrThrowCompanyWide: ReturnType<typeof vi.fn>; deleteLeadOrThrow: ReturnType<typeof vi.fn> };
  let eventService: { publish: ReturnType<typeof vi.fn> };
  let precheck: { deleteMany: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    repo = {
      getOrThrowCompanyWide: vi.fn((id: string) => Promise.resolve({ id, title: `Lead ${id}` })),
      deleteLeadOrThrow: vi.fn((id: string) => Promise.resolve(id)),
    };
    eventService = { publish: vi.fn().mockResolvedValue(undefined) };
    precheck = { deleteMany: vi.fn().mockResolvedValue(undefined) };
  });

  function createInteractor() {
    return new DeleteManyLeadsInteractor(repo as never, eventService as never, precheck as never);
  }

  it("deletes every selected lead and announces each deletion", async () => {
    const result = await createInteractor().invoke({ ids: [LEAD_1, LEAD_2] });

    expect(result).toEqual({ ok: true, data: [LEAD_1, LEAD_2] });
    expect(repo.deleteLeadOrThrow.mock.calls.map(([id]) => id)).toEqual([LEAD_1, LEAD_2]);
    const deleted = eventService.publish.mock.calls.filter(([event]) => event === DomainEvent.LEAD_DELETED);
    expect(deleted.map(([, body]) => body.entityId)).toEqual([LEAD_1, LEAD_2]);
    expect(deleted[0][1].payload).toEqual(expect.objectContaining({ id: LEAD_1 }));
  });

  it("runs the lead precheck for the whole selection", async () => {
    await createInteractor().invoke({ ids: [LEAD_1, LEAD_2] });

    expect(precheck.deleteMany).toHaveBeenCalledWith({ ids: [LEAD_1, LEAD_2] }, expect.anything());
  });

  it("refuses an empty or oversized selection", () => {
    expect(DeleteManyLeadsSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(DeleteManyLeadsSchema.safeParse({ ids: Array.from({ length: 101 }, () => LEAD_1) }).success).toBe(false);
  });
});
