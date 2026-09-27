import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { interactorFailureKind } from "@/core/validation/validation.utils";

vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve({ raw: (key: string) => key }) }));

import { PrismaDealStageDurationsRepo } from "../get/prisma-deal-stage-durations.repository";
import { GetDealStageDurationsInteractor } from "../get/get-deal-stage-durations.interactor";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const DAY = 86_400;
const NOW = new Date("2026-03-10T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY * 1000);
}

describeDatabase("deal stage durations on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const viewerId = randomUUID();
  const colleagueId = randomUUID();
  const pipelineId = randomUUID();
  const otherPipelineId = randomUUID();

  const stages = { qualified: randomUUID(), proposal: randomUUID(), won: randomUUID() };
  const deals = {
    viewers: randomUUID(),
    colleagues: randomUUID(),
    unplaced: randomUUID(),
    otherTenant: randomUUID(),
  };

  const readAll: TenantUser = {
    ...createMockUserWithPermissions([{ resource: Resource.deals, action: Action.readAll }]),
    id: colleagueId,
    companyId,
  };

  const readOwn: TenantUser = {
    ...createMockUserWithPermissions([{ resource: Resource.deals, action: Action.readOwn }]),
    id: viewerId,
    companyId,
  };

  function durationsAs(user: TenantUser, dealId: string) {
    return runWithTenant(user, () => new PrismaDealStageDurationsRepo().getDealStageDurations(dealId, NOW));
  }

  async function insertHistory(args: {
    company?: string;
    dealId: string;
    toStageId: string;
    enteredAt: Date;
    exitedAt?: Date;
  }) {
    const exitedAt = args.exitedAt ?? null;
    const durationSeconds = exitedAt ? Math.round((exitedAt.getTime() - args.enteredAt.getTime()) / 1000) : null;

    await client.query(
      'INSERT INTO "DealStageHistory" ("id", "companyId", "dealId", "toStageId", "enteredAt", "exitedAt", "durationSeconds") VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        randomUUID(),
        args.company ?? companyId,
        args.dealId,
        args.toStageId,
        args.enteredAt.toISOString(),
        exitedAt?.toISOString() ?? null,
        durationSeconds,
      ],
    );
  }

  beforeAll(async () => {
    await client.connect();

    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);

    for (const [id, first] of [
      [viewerId, "Viewer"],
      [colleagueId, "Colleague"],
    ] as const) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `${id}@example.com`, first, "Person", companyId],
      );
    }

    for (const [id, company] of [
      [pipelineId, companyId],
      [otherPipelineId, otherCompanyId],
    ] as const) {
      await client.query(
        'INSERT INTO "Pipeline" ("id", "companyId", "name", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
        [id, company, "Sales"],
      );
    }

    for (const [id, name, position, kind] of [
      [stages.won, "Won", 2, "won"],
      [stages.qualified, "Qualified", 0, "open"],
      [stages.proposal, "Proposal", 1, "open"],
    ] as const) {
      await client.query(
        'INSERT INTO "PipelineStage" ("id", "companyId", "pipelineId", "name", "position", "kind", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::"StageKind", CURRENT_TIMESTAMP)',
        [id, companyId, pipelineId, name, position, kind],
      );
    }

    for (const [id, company, pipeline, stage, enteredAt] of [
      [deals.viewers, companyId, pipelineId, stages.proposal, daysAgo(2)],
      [deals.colleagues, companyId, pipelineId, stages.qualified, daysAgo(1)],
      [deals.unplaced, companyId, null, null, null],
      [deals.otherTenant, otherCompanyId, otherPipelineId, null, null],
    ] as const) {
      await client.query(
        'INSERT INTO "Deal" ("id", "name", "companyId", "pipelineId", "stageId", "stageEnteredAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [id, `deal ${id}`, company, pipeline, stage, enteredAt?.toISOString() ?? null],
      );
    }

    for (const [dealId, userId] of [
      [deals.viewers, viewerId],
      [deals.colleagues, colleagueId],
    ] as const) {
      await client.query(
        'INSERT INTO "DealUser" ("id", "dealId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [randomUUID(), dealId, userId, companyId],
      );
    }

    await insertHistory({
      dealId: deals.viewers,
      toStageId: stages.qualified,
      enteredAt: daysAgo(10),
      exitedAt: daysAgo(7),
    });
    await insertHistory({
      dealId: deals.viewers,
      toStageId: stages.proposal,
      enteredAt: daysAgo(7),
      exitedAt: daysAgo(5),
    });
    await insertHistory({
      dealId: deals.viewers,
      toStageId: stages.qualified,
      enteredAt: daysAgo(5),
      exitedAt: daysAgo(2),
    });
    await insertHistory({ dealId: deals.viewers, toStageId: stages.proposal, enteredAt: daysAgo(2) });
    await insertHistory({
      company: otherCompanyId,
      dealId: deals.viewers,
      toStageId: stages.won,
      enteredAt: daysAgo(30),
      exitedAt: daysAgo(20),
    });

    await insertHistory({ dealId: deals.colleagues, toStageId: stages.qualified, enteredAt: daysAgo(1) });
  });

  afterAll(async () => {
    for (const id of [companyId, otherCompanyId]) {
      await client.query('DELETE FROM "DealStageHistory" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "DealUser" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "PipelineStage" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "Pipeline" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [id]);
    }
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1::text[])', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("totals every visit per stage, counts the open visit up to now and lists the whole pipeline in order", async () => {
    const result = await durationsAs(readAll, deals.viewers);

    expect(result?.stages.map((stage) => [stage.name, stage.durationSeconds, stage.visits, stage.isCurrent])).toEqual([
      ["Qualified", 6 * DAY, 2, false],
      ["Proposal", 4 * DAY, 2, true],
      ["Won", 0, 0, false],
    ]);
    expect(result).toMatchObject({
      dealId: deals.viewers,
      pipelineId,
      currentStageId: stages.proposal,
      measuredAt: NOW,
    });
    expect(result?.stages[0].lastEnteredAt).toEqual(daysAgo(5));
    expect(result?.stages[2].lastEnteredAt).toBeNull();
  });

  it("ignores a history row stamped with another tenant", async () => {
    const result = await durationsAs(readAll, deals.viewers);

    expect(result?.stages.find((stage) => stage.stageId === stages.won)?.durationSeconds).toBe(0);
  });

  it("lets a user who reads their own deals see the history of a deal assigned to them", async () => {
    const result = await durationsAs(readOwn, deals.viewers);

    expect(result?.stages.map((stage) => stage.durationSeconds)).toEqual([6 * DAY, 4 * DAY, 0]);
  });

  it("hides the history of a colleague's deal from a user who reads only their own", async () => {
    await expect(durationsAs(readOwn, deals.colleagues)).resolves.toBeNull();
    await expect(durationsAs(readAll, deals.colleagues)).resolves.toMatchObject({
      currentStageId: stages.qualified,
    });
  });

  it("never reads a deal of another tenant", async () => {
    await expect(durationsAs(readAll, deals.otherTenant)).resolves.toBeNull();
  });

  it("answers an unknown deal with nothing", async () => {
    await expect(durationsAs(readAll, randomUUID())).resolves.toBeNull();
  });

  it("returns an empty stage list for a deal without a pipeline", async () => {
    await expect(durationsAs(readAll, deals.unplaced)).resolves.toMatchObject({
      pipelineId: null,
      currentStageId: null,
      stages: [],
    });
  });

  it("reports a colleague's deal as not found through the interactor", async () => {
    const interactor = new GetDealStageDurationsInteractor(new PrismaDealStageDurationsRepo());

    const hidden = await runWithTenant(readOwn, () => interactor.invoke({ id: deals.colleagues }));
    const visible = await runWithTenant(readOwn, () => interactor.invoke({ id: deals.viewers }));

    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(interactorFailureKind(hidden.error)).toBe("not_found");
    expect(visible.ok).toBe(true);
  });
});
