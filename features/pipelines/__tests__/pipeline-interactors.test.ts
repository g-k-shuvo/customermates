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
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { DeleteStageInteractor } from "../stages/delete-stage.interactor";
import { DeletePipelineInteractor } from "../delete/delete-pipeline.interactor";
import { CreatePipelineInteractor } from "../upsert/create-pipeline.interactor";
import { UpdatePipelineInteractor } from "../upsert/update-pipeline.interactor";
import { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";
import { ValidatePipelineStageIdsInteractor } from "@/core/validation/validators/validate-pipeline-stage-ids.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { getPipelineRepo, getPipelineStageIdsRepo } from "@/core/di";
import { StageKind } from "@/generated/prisma";

const PIPELINE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_PIPELINE_ID = "00000000-0000-4000-8000-000000000002";
const STAGE_ID = "00000000-0000-4000-8000-000000000010";
const MOVE_TO_STAGE_ID = "00000000-0000-4000-8000-000000000011";
const FOREIGN_STAGE_ID = "00000000-0000-4000-8000-000000000012";
const UNKNOWN_STAGE_ID = "00000000-0000-4000-8000-000000000013";

function issueCodes(result: any): CustomErrorCode[] {
  return result.error.issues.map((issue: any) => issue.params?.error);
}

function issueFor(result: any, code: CustomErrorCode) {
  return result.error.issues.find((issue: any) => issue.params?.error === code);
}

function makeStageDto(overrides: Record<string, unknown> = {}) {
  return {
    id: STAGE_ID,
    name: "Lead In",
    position: 0,
    probability: 10,
    rottingDays: null,
    kind: StageKind.open,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makePipelineDto(overrides: Record<string, unknown> = {}) {
  return {
    id: PIPELINE_ID,
    name: "Sales",
    position: 0,
    isDefault: false,
    archivedAt: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    stages: [makeStageDto()],
    ...overrides,
  };
}

describe("DeleteStageInteractor", () => {
  let mockRepo: any;
  let mockStagePipelineRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      countStagesInPipeline: vi.fn().mockResolvedValue(3),
      countDealsInStage: vi.fn().mockResolvedValue(0),
      moveDealsToStage: vi.fn().mockResolvedValue(0),
      deleteStageOrThrow: vi.fn().mockResolvedValue(makeStageDto()),
    };
    mockStagePipelineRepo = {
      findPipelineIdsByStageIds: vi.fn().mockResolvedValue(
        new Map([
          [STAGE_ID, PIPELINE_ID],
          [MOVE_TO_STAGE_ID, PIPELINE_ID],
          [FOREIGN_STAGE_ID, OTHER_PIPELINE_ID],
        ]),
      ),
    };
  });

  function createInteractor() {
    return new DeleteStageInteractor(
      mockRepo,
      mockStagePipelineRepo,
      new ValidatePipelineStageIdsInteractor(getPipelineStageIdsRepo()),
    );
  }

  it("deletes a stage that is neither the last one nor holding deals", async () => {
    const result: any = await createInteractor().invoke({ id: STAGE_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(STAGE_ID);
    expect(mockRepo.deleteStageOrThrow).toHaveBeenCalledWith(STAGE_ID);
    expect(mockRepo.moveDealsToStage).not.toHaveBeenCalled();
  });

  it("refuses to delete the last stage of a pipeline", async () => {
    mockRepo.countStagesInPipeline.mockResolvedValue(1);

    const result: any = await createInteractor().invoke({ id: STAGE_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineStageLastInPipeline);
    expect(issueFor(result, CustomErrorCode.pipelineStageLastInPipeline).path).toEqual(["id"]);
    expect(mockRepo.deleteStageOrThrow).not.toHaveBeenCalled();
  });

  it("refuses to delete a stage holding deals and reports the deal count", async () => {
    mockRepo.countDealsInStage.mockResolvedValue(7);

    const result: any = await createInteractor().invoke({ id: STAGE_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineStageHasDeals);
    expect(issueFor(result, CustomErrorCode.pipelineStageHasDeals).params.count).toBe(7);
    expect(issueFor(result, CustomErrorCode.pipelineStageHasDeals).path).toEqual(["id"]);
    expect(mockRepo.deleteStageOrThrow).not.toHaveBeenCalled();
  });

  it("reassigns deals to moveToStageId instead of refusing", async () => {
    mockRepo.countDealsInStage.mockResolvedValue(7);

    const result: any = await createInteractor().invoke({ id: STAGE_ID, moveToStageId: MOVE_TO_STAGE_ID });

    expect(result.ok).toBe(true);
    expect(result.data).toBe(STAGE_ID);
    expect(mockRepo.moveDealsToStage).toHaveBeenCalledWith(STAGE_ID, MOVE_TO_STAGE_ID);
    expect(mockRepo.deleteStageOrThrow).toHaveBeenCalledWith(STAGE_ID);
  });

  it("does not reassign deals when the stage holds none", async () => {
    const result: any = await createInteractor().invoke({ id: STAGE_ID, moveToStageId: MOVE_TO_STAGE_ID });

    expect(result.ok).toBe(true);
    expect(mockRepo.moveDealsToStage).not.toHaveBeenCalled();
    expect(mockRepo.deleteStageOrThrow).toHaveBeenCalledWith(STAGE_ID);
  });

  it("refuses a moveToStageId belonging to a different pipeline", async () => {
    mockRepo.countDealsInStage.mockResolvedValue(7);

    const result: any = await createInteractor().invoke({ id: STAGE_ID, moveToStageId: FOREIGN_STAGE_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineStageMismatch);
    expect(issueFor(result, CustomErrorCode.pipelineStageMismatch).path).toEqual(["moveToStageId"]);
    expect(mockRepo.moveDealsToStage).not.toHaveBeenCalled();
    expect(mockRepo.deleteStageOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a moveToStageId equal to the stage being deleted", async () => {
    const result: any = await createInteractor().invoke({ id: STAGE_ID, moveToStageId: STAGE_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineStageMismatch);
    expect(mockStagePipelineRepo.findPipelineIdsByStageIds).not.toHaveBeenCalled();
    expect(mockRepo.deleteStageOrThrow).not.toHaveBeenCalled();
  });

  it("refuses a stage that resolves to no pipeline", async () => {
    const result: any = await createInteractor().invoke({ id: UNKNOWN_STAGE_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineStageNotFound);
    expect(mockRepo.deleteStageOrThrow).not.toHaveBeenCalled();
  });
});

describe("CreatePipelineInteractor", () => {
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      createPipelineOrThrow: vi.fn().mockResolvedValue(makePipelineDto({ isDefault: true })),
      demoteDefaultPipelinesExcept: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createInteractor() {
    return new CreatePipelineInteractor(mockRepo);
  }

  it("demotes every existing default when the new pipeline is the default", async () => {
    const result: any = await createInteractor().invoke({
      name: "Sales",
      position: 0,
      isDefault: true,
      stages: [{ name: "Open", probability: 0, rottingDays: null, kind: "open" }],
    });

    expect(result.ok).toBe(true);
    expect(mockRepo.demoteDefaultPipelinesExcept).toHaveBeenCalledWith(null);
    expect(mockRepo.createPipelineOrThrow).toHaveBeenCalled();
    expect(mockRepo.demoteDefaultPipelinesExcept.mock.invocationCallOrder[0]).toBeLessThan(
      mockRepo.createPipelineOrThrow.mock.invocationCallOrder[0],
    );
  });

  it("leaves the existing default alone when the new pipeline is not the default", async () => {
    mockRepo.createPipelineOrThrow.mockResolvedValue(makePipelineDto());

    const result: any = await createInteractor().invoke({
      name: "Sales",
      position: 0,
      isDefault: false,
      stages: [{ name: "Open", probability: 0, rottingDays: null, kind: "open" }],
    });

    expect(result.ok).toBe(true);
    expect(mockRepo.demoteDefaultPipelinesExcept).not.toHaveBeenCalled();
  });
});

describe("UpdatePipelineInteractor", () => {
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      updatePipelineOrThrow: vi.fn().mockResolvedValue(makePipelineDto({ isDefault: true })),
      demoteDefaultPipelinesExcept: vi.fn().mockResolvedValue(undefined),
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(makePipelineDto({ isDefault: false })),
    };
  });

  function createInteractor() {
    return new UpdatePipelineInteractor(mockRepo, new ValidatePipelineIdsInteractor(getPipelineRepo()));
  }

  it("demotes the previous default before promoting this pipeline", async () => {
    const result: any = await createInteractor().invoke({ id: PIPELINE_ID, isDefault: true });

    expect(result.ok).toBe(true);
    expect(result.data.isDefault).toBe(true);
    expect(mockRepo.demoteDefaultPipelinesExcept).toHaveBeenCalledWith(PIPELINE_ID);
    expect(mockRepo.demoteDefaultPipelinesExcept.mock.invocationCallOrder[0]).toBeLessThan(
      mockRepo.updatePipelineOrThrow.mock.invocationCallOrder[0],
    );
  });

  it("leaves the previous default alone when isDefault is not set", async () => {
    mockRepo.updatePipelineOrThrow.mockResolvedValue(makePipelineDto({ name: "Renamed" }));

    const result: any = await createInteractor().invoke({ id: PIPELINE_ID, name: "Renamed" });

    expect(result.ok).toBe(true);
    expect(mockRepo.demoteDefaultPipelinesExcept).not.toHaveBeenCalled();
  });

  it("refuses to demote the only default pipeline", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makePipelineDto({ isDefault: true }));

    const result: any = await createInteractor().invoke({ id: PIPELINE_ID, isDefault: false });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].params.error).toBe(CustomErrorCode.pipelineDefaultRequired);
    expect(mockRepo.updatePipelineOrThrow).not.toHaveBeenCalled();
    expect(mockRepo.demoteDefaultPipelinesExcept).not.toHaveBeenCalled();
  });

  it("allows clearing isDefault on a pipeline that is not the default", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makePipelineDto({ isDefault: false }));
    mockRepo.updatePipelineOrThrow.mockResolvedValue(makePipelineDto());

    const result: any = await createInteractor().invoke({ id: PIPELINE_ID, isDefault: false });

    expect(result.ok).toBe(true);
    expect(mockRepo.demoteDefaultPipelinesExcept).not.toHaveBeenCalled();
  });
});

describe("DeletePipelineInteractor", () => {
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(makePipelineDto({ isDefault: false })),
      countDealsInPipeline: vi.fn().mockResolvedValue(0),
      deletePipelineOrThrow: vi.fn().mockResolvedValue(makePipelineDto()),
    };
  });

  function createInteractor() {
    return new DeletePipelineInteractor(mockRepo, new ValidatePipelineIdsInteractor(getPipelineRepo()));
  }

  it("deletes a non-default pipeline that holds no deals", async () => {
    const result: any = await createInteractor().invoke({ id: PIPELINE_ID });

    expect(result.ok).toBe(true);
    expect(mockRepo.deletePipelineOrThrow).toHaveBeenCalledWith(PIPELINE_ID);
  });

  it("refuses to delete the default pipeline", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makePipelineDto({ isDefault: true }));

    const result: any = await createInteractor().invoke({ id: PIPELINE_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineDefaultRequired);
    expect(mockRepo.deletePipelineOrThrow).not.toHaveBeenCalled();
  });

  it("refuses to delete a pipeline that still holds deals and reports the count", async () => {
    mockRepo.countDealsInPipeline.mockResolvedValue(7);

    const result: any = await createInteractor().invoke({ id: PIPELINE_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineHasDeals);
    expect(result.error.issues[0].params.count).toBe(7);
    expect(mockRepo.deletePipelineOrThrow).not.toHaveBeenCalled();
  });
});
