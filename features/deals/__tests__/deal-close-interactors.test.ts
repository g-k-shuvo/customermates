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

import { MarkDealWonInteractor } from "../close/mark-deal-won.interactor";
import { MarkDealLostInteractor } from "../close/mark-deal-lost.interactor";
import { ReopenDealInteractor } from "../close/reopen-deal.interactor";
import { dealStageMove, lostTransition, reopenTransition, wonTransition } from "../close/closing-transition";
import { DomainEvent } from "@/features/event/domain-events";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { DealStatus } from "@/generated/prisma";

import { DealWritePrecheckInteractor } from "../upsert/deal-write-precheck.interactor";
import { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import { ValidateLostReasonIdsInteractor } from "@/core/validation/validators/validate-lost-reason-ids.interactor";
import { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";
import { ValidatePipelineStageIdsInteractor } from "@/core/validation/validators/validate-pipeline-stage-ids.interactor";
import { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import {
  getOrganizationRepo,
  getUserRepo,
  getContactRepo,
  getServiceRepo,
  getTaskRepo,
  getDealRepo,
  getCustomColumnRepo,
  getUserService,
  getPipelineRepo,
  getPipelineStageIdsRepo,
  getLostReasonRepo,
} from "@/core/di";
import type { UserService } from "@/features/user/user.service";

const DEAL_ID = "00000000-0000-4000-8000-000000000001";
const UNKNOWN_DEAL_ID = "00000000-0000-4000-8000-0000000000ff";
const LOST_REASON_ID = "00000000-0000-4000-8000-000000000040";
const UNKNOWN_LOST_REASON_ID = "00000000-0000-4000-8000-0000000000fe";
const STAGE_ID = "00000000-0000-4000-8000-000000000050";
const UNKNOWN_STAGE_ID = "00000000-0000-4000-8000-0000000000fd";
const WON_STAGE_ID = "00000000-0000-4000-8000-000000000051";

type PrecheckOverrides = {
  dealIds?: Set<string>;
  lostReasonIds?: Set<string>;
  stageIds?: Set<string>;
};

function fixedIdRepo(ids: Set<string>) {
  return { findIds: () => Promise.resolve(ids) };
}

function makePrecheck(overrides: PrecheckOverrides = {}): DealWritePrecheckInteractor {
  const { dealIds, lostReasonIds, stageIds } = overrides;
  const dealRepo = dealIds ? fixedIdRepo(dealIds) : getDealRepo();
  const lostReasonRepo = lostReasonIds ? fixedIdRepo(lostReasonIds) : getLostReasonRepo();
  const stageRepo = stageIds ? fixedIdRepo(stageIds) : getPipelineStageIdsRepo();

  return new DealWritePrecheckInteractor(
    new ValidateOrganizationIdsInteractor(getOrganizationRepo()),
    new ValidateUserIdsInteractor(getUserRepo()),
    new ValidateContactIdsInteractor(getContactRepo()),
    new ValidateServiceIdsInteractor(getServiceRepo()),
    new ValidateTaskIdsInteractor(getTaskRepo()),
    new ValidateDealIdsInteractor(dealRepo),
    new ValidateCustomFieldValuesInteractor(getCustomColumnRepo()),
    new ValidateAssigneeGuardInteractor(getUserService() as unknown as UserService),
    new ValidatePipelineIdsInteractor(getPipelineRepo()),
    new ValidatePipelineStageIdsInteractor(stageRepo),
    getPipelineRepo(),
    getPipelineRepo(),
    getDealRepo(),
    new ValidateLostReasonIdsInteractor(lostReasonRepo),
  );
}

function makeDealDto(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    name: "Test Deal",
    totalValue: 100,
    totalQuantity: 1,
    weightedValue: null,
    pipelineId: null,
    stageId: null,
    status: DealStatus.open,
    expectedCloseDate: null,
    probability: null,
    stageEnteredAt: null,
    lostReasonId: null,
    lostNotes: null,
    wonAt: null,
    lostAt: null,
    closedAt: null,
    notes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    organizations: [],
    users: [],
    tasks: [],
    contacts: [],
    services: [],
    customFieldValues: [],
    ...overrides,
  };
}

function issueCodes(result: any): CustomErrorCode[] {
  return result.error.issues.map((issue: any) => issue.params?.error);
}

function dealUpdatedCalls(eventService: any) {
  return eventService.publish.mock.calls.filter(([event]: [DomainEvent]) => event === DomainEvent.DEAL_UPDATED);
}

describe("MarkDealWonInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(makeDealDto()),
      markDealWonOrThrow: vi.fn().mockResolvedValue(
        makeDealDto({
          status: DealStatus.won,
          probability: 100,
          wonAt: new Date("2026-02-01"),
          closedAt: new Date("2026-02-01"),
        }),
      ),
    };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function interactor(overrides: PrecheckOverrides = {}) {
    return new MarkDealWonInteractor(mockRepo, mockEventService, makePrecheck(overrides));
  }

  it("closes an open deal as won and answers with the stored deal", async () => {
    const result: any = await interactor().invoke({ id: DEAL_ID });

    expect(result.ok).toBe(true);
    expect(result.data.status).toBe(DealStatus.won);
    expect(result.data.probability).toBe(100);
    expect(mockRepo.markDealWonOrThrow).toHaveBeenCalledWith(DEAL_ID);
  });

  it("reports a conflict when a concurrent transition already closed the deal", async () => {
    mockRepo.markDealWonOrThrow.mockResolvedValue(null);

    const result: any = await interactor().invoke({ id: DEAL_ID });

    expect(result.ok).toBe(false);
    expect(result.error.issues[0].params.error).toBe(CustomErrorCode.dealAlreadyClosed);
    expect(dealUpdatedCalls(mockEventService)).toHaveLength(0);
  });

  it("publishes DEAL_UPDATED with the deal and the changes", async () => {
    await interactor().invoke({ id: DEAL_ID });

    const calls = dealUpdatedCalls(mockEventService);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ id: DEAL_ID, status: DealStatus.won }),
          changes: expect.objectContaining({ status: { previous: DealStatus.open, current: DealStatus.won } }),
        }),
      }),
    );
  });

  it("refuses to close a deal that is already won, without writing or publishing", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makeDealDto({ status: DealStatus.won }));

    const result: any = await interactor().invoke({ id: DEAL_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.dealAlreadyClosed);
    expect(mockRepo.markDealWonOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("refuses to close a deal that is already lost", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makeDealDto({ status: DealStatus.lost }));

    const result: any = await interactor().invoke({ id: DEAL_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.dealAlreadyClosed);
    expect(mockRepo.markDealWonOrThrow).not.toHaveBeenCalled();
  });

  it("reports an unknown deal id as dealNotFound and writes nothing", async () => {
    const result: any = await interactor({ dealIds: new Set<string>() }).invoke({ id: UNKNOWN_DEAL_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.dealNotFound);
    expect(mockRepo.markDealWonOrThrow).not.toHaveBeenCalled();
  });
});

describe("MarkDealLostInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(makeDealDto()),
      markDealLostOrThrow: vi.fn().mockResolvedValue(
        makeDealDto({
          status: DealStatus.lost,
          probability: 0,
          lostReasonId: LOST_REASON_ID,
          lostNotes: "Undercut on price",
          lostAt: new Date("2026-02-01"),
          closedAt: new Date("2026-02-01"),
        }),
      ),
    };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function interactor(overrides: PrecheckOverrides = {}) {
    return new MarkDealLostInteractor(mockRepo, mockEventService, makePrecheck(overrides));
  }

  it("closes an open deal as lost with its reason and notes", async () => {
    const result: any = await interactor().invoke({
      id: DEAL_ID,
      lostReasonId: LOST_REASON_ID,
      lostNotes: "Undercut on price",
    });

    expect(result.ok).toBe(true);
    expect(result.data.status).toBe(DealStatus.lost);
    expect(mockRepo.markDealLostOrThrow).toHaveBeenCalledWith({
      id: DEAL_ID,
      lostReasonId: LOST_REASON_ID,
      lostNotes: "Undercut on price",
    });
  });

  it("stores an absent note as null", async () => {
    await interactor().invoke({ id: DEAL_ID, lostReasonId: LOST_REASON_ID });

    expect(mockRepo.markDealLostOrThrow).toHaveBeenCalledWith({
      id: DEAL_ID,
      lostReasonId: LOST_REASON_ID,
      lostNotes: null,
    });
  });

  it("publishes DEAL_UPDATED with the deal and the changes", async () => {
    await interactor().invoke({ id: DEAL_ID, lostReasonId: LOST_REASON_ID });

    const calls = dealUpdatedCalls(mockEventService);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ status: DealStatus.lost }),
          changes: expect.objectContaining({ status: { previous: DealStatus.open, current: DealStatus.lost } }),
        }),
      }),
    );
  });

  it("refuses to mark a deal lost without a lost reason", async () => {
    const result: any = await interactor().invoke({ id: DEAL_ID } as never);

    expect(result.ok).toBe(false);
    expect(result.error.issues.some((issue: any) => issue.path.includes("lostReasonId"))).toBe(true);
    expect(mockRepo.markDealLostOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("rejects a lost reason that belongs to another company", async () => {
    const result: any = await interactor({ lostReasonIds: new Set<string>() }).invoke({
      id: DEAL_ID,
      lostReasonId: UNKNOWN_LOST_REASON_ID,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.lostReasonNotFound);
    expect(mockRepo.markDealLostOrThrow).not.toHaveBeenCalled();
  });

  it("refuses to close a deal that is already closed, without writing or publishing", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makeDealDto({ status: DealStatus.lost }));

    const result: any = await interactor().invoke({ id: DEAL_ID, lostReasonId: LOST_REASON_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.dealAlreadyClosed);
    expect(mockRepo.markDealLostOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });
});

describe("ReopenDealInteractor", () => {
  let mockRepo: any;
  let mockEventService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getOrThrowCompanyWide: vi.fn().mockResolvedValue(
        makeDealDto({
          status: DealStatus.won,
          probability: 100,
          wonAt: new Date("2026-02-01"),
          closedAt: new Date("2026-02-01"),
        }),
      ),
      reopenDealOrThrow: vi.fn().mockResolvedValue(makeDealDto({ status: DealStatus.open, stageId: STAGE_ID })),
    };
    mockEventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function interactor(overrides: PrecheckOverrides = {}) {
    return new ReopenDealInteractor(mockRepo, mockEventService, makePrecheck(overrides));
  }

  it("reopens a won deal and answers with the stored deal", async () => {
    const result: any = await interactor().invoke({ id: DEAL_ID });

    expect(result.ok).toBe(true);
    expect(result.data.status).toBe(DealStatus.open);
    expect(mockRepo.reopenDealOrThrow).toHaveBeenCalledWith({ id: DEAL_ID, stageId: null });
  });

  it("passes an explicit target stage through to the write", async () => {
    await interactor().invoke({ id: DEAL_ID, stageId: STAGE_ID });

    expect(mockRepo.reopenDealOrThrow).toHaveBeenCalledWith({ id: DEAL_ID, stageId: STAGE_ID });
  });

  it("publishes DEAL_UPDATED so stage history stays correct", async () => {
    await interactor().invoke({ id: DEAL_ID });

    const calls = dealUpdatedCalls(mockEventService);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(
      expect.objectContaining({
        entityId: DEAL_ID,
        payload: expect.objectContaining({
          deal: expect.objectContaining({ status: DealStatus.open }),
          changes: expect.objectContaining({ status: { previous: DealStatus.won, current: DealStatus.open } }),
        }),
      }),
    );
  });

  it("refuses to reopen a deal that is already open, without writing or publishing", async () => {
    mockRepo.getOrThrowCompanyWide.mockResolvedValue(makeDealDto({ status: DealStatus.open }));

    const result: any = await interactor().invoke({ id: DEAL_ID });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.dealNotClosed);
    expect(mockRepo.reopenDealOrThrow).not.toHaveBeenCalled();
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  it("rejects a target stage that does not exist", async () => {
    const result: any = await interactor({ stageIds: new Set<string>() }).invoke({
      id: DEAL_ID,
      stageId: UNKNOWN_STAGE_ID,
    });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain(CustomErrorCode.pipelineStageNotFound);
    expect(mockRepo.reopenDealOrThrow).not.toHaveBeenCalled();
  });
});

describe("closing transitions", () => {
  const closedAt = new Date("2026-02-01T10:00:00Z");

  it("stamps a won close and clears every loss field", () => {
    expect(wonTransition(closedAt)).toEqual({
      status: DealStatus.won,
      probability: 100,
      wonAt: closedAt,
      lostAt: null,
      closedAt,
      lostReasonId: null,
      lostNotes: null,
      rottingAt: null,
    });
  });

  it("stamps a lost close, keeps the reason and clears wonAt", () => {
    expect(lostTransition(closedAt, LOST_REASON_ID, "Undercut on price")).toEqual({
      status: DealStatus.lost,
      probability: 0,
      wonAt: null,
      lostAt: closedAt,
      closedAt,
      lostReasonId: LOST_REASON_ID,
      lostNotes: "Undercut on price",
      rottingAt: null,
    });
  });

  it("resets a reopened deal to a null probability rather than zero", () => {
    const rottingAt = new Date("2026-02-15T10:00:00Z");
    const transition = reopenTransition(rottingAt);

    expect(transition.probability).toBeNull();
    expect(transition.probability).not.toBe(0);
    expect(transition).toEqual({
      status: DealStatus.open,
      probability: null,
      wonAt: null,
      lostAt: null,
      closedAt: null,
      lostReasonId: null,
      lostNotes: null,
      rottingAt,
    });
  });

  it("carries the recomputed rotting deadline of the stage the deal reopens into", () => {
    expect(reopenTransition(null).rottingAt).toBeNull();
  });

  it("moves to a terminal stage and stamps stageEnteredAt", () => {
    expect(dealStageMove(WON_STAGE_ID, STAGE_ID, closedAt)).toEqual({
      stageId: WON_STAGE_ID,
      stageEnteredAt: closedAt,
    });
  });

  it("leaves the stage alone when the pipeline has no stage of that kind", () => {
    expect(dealStageMove(null, STAGE_ID, closedAt)).toEqual({});
  });

  it("does not restamp stageEnteredAt when the deal already sits on the target stage", () => {
    expect(dealStageMove(WON_STAGE_ID, WON_STAGE_ID, closedAt)).toEqual({});
  });
});
