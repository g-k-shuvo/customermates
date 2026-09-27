import type { DealStageDurationsDto } from "../deal-stage-durations.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Action, Resource, StageKind } from "@/generated/prisma";

import { ForbiddenError } from "@/core/errors/app-errors";
import { interactorFailureKind, interactorFailureStatus } from "@/core/validation/validation.utils";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve({ raw: (key: string) => key }) }));

import { GetDealStageDurationsInteractor } from "../get/get-deal-stage-durations.interactor";

const DEAL_ID = "60000000-0000-4000-8000-000000000001";
const STAGE_ID = "60000000-0000-4000-8000-000000000002";

function durations(): DealStageDurationsDto {
  return {
    dealId: DEAL_ID,
    pipelineId: "60000000-0000-4000-8000-000000000003",
    currentStageId: STAGE_ID,
    measuredAt: new Date("2026-03-10T12:00:00.000Z"),
    stages: [
      {
        stageId: STAGE_ID,
        name: "Qualified",
        position: 0,
        kind: StageKind.open,
        durationSeconds: 3_600,
        visits: 1,
        isCurrent: true,
        lastEnteredAt: new Date("2026-03-10T11:00:00.000Z"),
      },
    ],
  };
}

const repo = { getDealStageDurations: vi.fn() };

describe("GetDealStageDurationsInteractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = createMockUser();
    repo.getDealStageDurations.mockResolvedValue(durations());
  });

  it("returns the time the deal spent in each stage, measured now", async () => {
    const before = Date.now();
    const result = await new GetDealStageDurationsInteractor(repo).invoke({ id: DEAL_ID });

    expect(result).toEqual({ ok: true, data: durations() });
    expect(repo.getDealStageDurations).toHaveBeenCalledWith(DEAL_ID, expect.any(Date));
    const measuredAt = (repo.getDealStageDurations.mock.calls[0] as [string, Date])[1].getTime();
    expect(measuredAt).toBeGreaterThanOrEqual(before);
    expect(measuredAt).toBeLessThanOrEqual(Date.now());
  });

  it("answers not_found for a deal the caller cannot see, without throwing", async () => {
    repo.getDealStageDurations.mockResolvedValue(null);

    const result = await new GetDealStageDurationsInteractor(repo).invoke({ id: DEAL_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(interactorFailureKind(result.error)).toBe("not_found");
    expect(interactorFailureStatus(result.error)).toBe(404);
    expect(result.error.issues[0]).toMatchObject({ path: ["id"], params: { error: "dealNotFound" } });
  });

  it("rejects an id that is not a uuid before reading anything", async () => {
    const result = await new GetDealStageDurationsInteractor(repo).invoke({ id: "not-a-uuid" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(interactorFailureKind(result.error)).toBe("validation");
    expect(repo.getDealStageDurations).not.toHaveBeenCalled();
  });

  it("serves a user who may only read their own deals", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.deals, action: Action.readOwn }]);

    const result = await new GetDealStageDurationsInteractor(repo).invoke({ id: DEAL_ID });

    expect(result.ok).toBe(true);
  });

  it("refuses a user who may not read deals at all", async () => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readAll }]);

    await expect(new GetDealStageDurationsInteractor(repo).invoke({ id: DEAL_ID })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repo.getDealStageDurations).not.toHaveBeenCalled();
  });

  it("refuses a repository answer the response schema does not accept", async () => {
    repo.getDealStageDurations.mockResolvedValue({ ...durations(), dealId: "not-a-uuid" });

    await expect(new GetDealStageDurationsInteractor(repo).invoke({ id: DEAL_ID })).rejects.toThrow();
  });
});
