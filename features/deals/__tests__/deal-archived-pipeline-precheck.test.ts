import type { z } from "zod";

import type { CreateDealData } from "../upsert/create-deal.interactor";
import type { CreateManyDealsData } from "../upsert/create-many-deals.interactor";
import type { UpdateDealData } from "../upsert/update-deal.interactor";
import type { UpdateManyDealsData } from "../upsert/update-many-deals.interactor";

import { describe, it, expect, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { DealWritePrecheckInteractor } from "../upsert/deal-write-precheck.interactor";

const ACTIVE_PIPELINE_ID = "00000000-0000-4000-8000-000000000060";
const ARCHIVED_PIPELINE_ID = "00000000-0000-4000-8000-000000000061";
const ACTIVE_STAGE_ID = "00000000-0000-4000-8000-000000000050";
const ARCHIVED_STAGE_ID = "00000000-0000-4000-8000-000000000052";
const ACTIVE_DEAL_ID = "00000000-0000-4000-8000-000000000001";
const ARCHIVED_DEAL_ID = "00000000-0000-4000-8000-000000000002";

const PIPELINE_BY_STAGE = new Map<string, string>([
  [ACTIVE_STAGE_ID, ACTIVE_PIPELINE_ID],
  [ARCHIVED_STAGE_ID, ARCHIVED_PIPELINE_ID],
]);

const PIPELINE_BY_DEAL = new Map<string, string>([
  [ACTIVE_DEAL_ID, ACTIVE_PIPELINE_ID],
  [ARCHIVED_DEAL_ID, ARCHIVED_PIPELINE_ID],
]);

type Issue = { params?: { error?: CustomErrorCode }; path?: (string | number)[] };

function makePrecheck() {
  const passing = { invoke: vi.fn().mockResolvedValue(undefined) } as never;

  const stagePipelineRepo = {
    findPipelineIdsByStageIds: vi
      .fn()
      .mockImplementation((ids: Set<string>) =>
        Promise.resolve(
          new Map([...ids].flatMap((id) => (PIPELINE_BY_STAGE.has(id) ? [[id, PIPELINE_BY_STAGE.get(id)]] : []))),
        ),
      ),
  };

  const archivedPipelineRepo = {
    findArchivedIds: vi
      .fn()
      .mockImplementation((ids: Set<string>) =>
        Promise.resolve(new Set([...ids].filter((id) => id === ARCHIVED_PIPELINE_ID))),
      ),
  };

  const dealPipelineRepo = {
    findPipelineIdsByDealIds: vi
      .fn()
      .mockImplementation((ids: Set<string>) =>
        Promise.resolve(
          new Map([...ids].flatMap((id) => (PIPELINE_BY_DEAL.has(id) ? [[id, PIPELINE_BY_DEAL.get(id)]] : []))),
        ),
      ),
  };

  const precheck = new DealWritePrecheckInteractor(
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    passing,
    stagePipelineRepo,
    archivedPipelineRepo,
    dealPipelineRepo,
    passing,
  );

  const issues: Issue[] = [];
  const ctx = { addIssue: (issue: Issue) => issues.push(issue) } as unknown as z.RefinementCtx;

  return { precheck, ctx, issues, stagePipelineRepo, archivedPipelineRepo, dealPipelineRepo };
}

function codes(issues: Issue[]) {
  return issues.map((issue) => issue.params?.error);
}

function createData(overrides: Record<string, unknown>) {
  return {
    name: "Acme renewal",
    organizationIds: [],
    userIds: [],
    contactIds: [],
    services: [],
    taskIds: [],
    customFieldValues: [],
    ...overrides,
  } as unknown as CreateDealData;
}

describe("DealWritePrecheckInteractor archived pipelines", () => {
  it("rejects a create that names an archived pipeline", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.create(createData({ pipelineId: ARCHIVED_PIPELINE_ID }), ctx);

    expect(codes(issues)).toEqual([CustomErrorCode.pipelineArchived]);
    expect(issues[0].path).toEqual(["pipelineId"]);
  });

  it("accepts a create that names an active pipeline", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.create(createData({ pipelineId: ACTIVE_PIPELINE_ID, stageId: ACTIVE_STAGE_ID }), ctx);

    expect(issues).toEqual([]);
  });

  it("accepts a create that names no placement at all", async () => {
    const { precheck, ctx, issues, archivedPipelineRepo } = makePrecheck();

    await precheck.create(createData({}), ctx);

    expect(issues).toEqual([]);
    expect(archivedPipelineRepo.findArchivedIds).not.toHaveBeenCalled();
  });

  it("rejects an update that moves a deal onto a stage of an archived pipeline", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.update({ id: ACTIVE_DEAL_ID, stageId: ARCHIVED_STAGE_ID } as unknown as UpdateDealData, ctx);

    expect(codes(issues)).toEqual([CustomErrorCode.pipelineArchived]);
    expect(issues[0].path).toEqual(["stageId"]);
  });

  it("reports the archived pipeline per row for a bulk create", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.createMany(
      {
        deals: [createData({ pipelineId: ACTIVE_PIPELINE_ID }), createData({ pipelineId: ARCHIVED_PIPELINE_ID })],
      } as unknown as CreateManyDealsData,
      ctx,
    );

    expect(codes(issues)).toEqual([CustomErrorCode.pipelineArchived]);
    expect(issues[0].path).toEqual(["deals", 1, "pipelineId"]);
  });

  it("accepts an ordinary edit of a deal that already lives on an archived pipeline", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.update(
      {
        id: ARCHIVED_DEAL_ID,
        name: "Renamed",
        pipelineId: ARCHIVED_PIPELINE_ID,
        stageId: ARCHIVED_STAGE_ID,
      } as unknown as UpdateDealData,
      ctx,
    );

    expect(issues).toEqual([]);
  });

  it("reports the archived pipeline per row for a bulk update", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.updateMany(
      {
        deals: [
          { id: ACTIVE_DEAL_ID, pipelineId: ACTIVE_PIPELINE_ID },
          { id: ACTIVE_DEAL_ID, pipelineId: ARCHIVED_PIPELINE_ID },
          { id: ACTIVE_DEAL_ID, stageId: ARCHIVED_STAGE_ID },
        ],
      } as unknown as UpdateManyDealsData,
      ctx,
    );

    expect(codes(issues)).toEqual([CustomErrorCode.pipelineArchived, CustomErrorCode.pipelineArchived]);
    expect(issues[0].path).toEqual(["deals", 1, "pipelineId"]);
    expect(issues[1].path).toEqual(["deals", 2, "stageId"]);
  });

  it("leaves a bulk row alone when it only restates the archived pipeline the deal is already on", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.updateMany(
      { deals: [{ id: ARCHIVED_DEAL_ID, pipelineId: ARCHIVED_PIPELINE_ID }] } as unknown as UpdateManyDealsData,
      ctx,
    );

    expect(issues).toEqual([]);
  });

  it("still reports a stage that belongs to a different pipeline", async () => {
    const { precheck, ctx, issues } = makePrecheck();

    await precheck.update(
      {
        id: ACTIVE_DEAL_ID,
        pipelineId: ACTIVE_PIPELINE_ID,
        stageId: ARCHIVED_STAGE_ID,
      } as unknown as UpdateDealData,
      ctx,
    );

    expect(codes(issues)).toEqual([CustomErrorCode.pipelineStageMismatch]);
    expect(issues[0].path).toEqual(["stageId"]);
  });
});
