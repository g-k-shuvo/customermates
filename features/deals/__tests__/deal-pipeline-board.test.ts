import type { Filter } from "@/core/base/base-get.schema";
import type { DomainEventMap } from "@/features/event/domain-events";
import type { DealStageHistoryRepo } from "../listener/deal-stage-history.listener";

import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => {
  const ids = {
    company: "test-company-id",
    deal: "00000000-0000-4000-8000-000000000001",
    newBusinessPipeline: "00000000-0000-4000-8000-000000000060",
    renewalsPipeline: "00000000-0000-4000-8000-000000000061",
    qualified: "00000000-0000-4000-8000-000000000050",
    proposal: "00000000-0000-4000-8000-000000000051",
    renewalDue: "00000000-0000-4000-8000-000000000052",
    renewalWon: "00000000-0000-4000-8000-000000000053",
  };

  const stages = [
    {
      id: ids.qualified,
      pipelineId: ids.newBusinessPipeline,
      name: "Qualified",
      position: 0,
      probability: 20,
      rottingDays: null,
      isDefaultPipeline: true,
    },
    {
      id: ids.proposal,
      pipelineId: ids.newBusinessPipeline,
      name: "Proposal",
      position: 1,
      probability: 60,
      rottingDays: null,
      isDefaultPipeline: true,
    },
    {
      id: ids.renewalDue,
      pipelineId: ids.renewalsPipeline,
      name: "Renewal due",
      position: 0,
      probability: 40,
      rottingDays: null,
      isDefaultPipeline: false,
    },
    {
      id: ids.renewalWon,
      pipelineId: ids.renewalsPipeline,
      name: "Renewed",
      position: 1,
      probability: 100,
      rottingDays: null,
      isDefaultPipeline: false,
    },
  ];

  const makeDeal = () => ({
    id: ids.deal,
    name: "Acme renewal",
    totalValue: 0,
    totalQuantity: 0,
    weightedValue: null,
    notes: null,
    companyId: ids.company,
    pipelineId: ids.newBusinessPipeline,
    stageId: ids.qualified,
    status: "open",
    expectedCloseDate: null,
    probability: null,
    stageEnteredAt: new Date("2026-09-01T00:00:00.000Z"),
    rottingAt: null,
    lostReasonId: null,
    lostNotes: null,
    wonAt: null,
    lostAt: null,
    closedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    organizations: [],
    users: [],
    contacts: [],
    services: [],
    tasks: [],
    customFieldValues: [],
  });

  let deal = makeDeal();
  const stageQueries: unknown[] = [];
  const dealUpdates: unknown[] = [];

  const client = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    deal: {
      findFirst: () => Promise.resolve({ ...deal }),
      findFirstOrThrow: () => Promise.resolve({ ...deal }),
      findMany: () => Promise.resolve([{ ...deal }]),
      updateMany: ({ where, data }: any) => {
        dealUpdates.push({ where, data });
        Object.assign(deal, data);

        return Promise.resolve({ count: 1 });
      },
      update: ({ data }: any) => {
        Object.assign(deal, data);

        return Promise.resolve({ ...deal });
      },
    },
    serviceDeal: { findMany: () => Promise.resolve([]) },
    pipelineStage: {
      findMany: ({ where }: any) => {
        stageQueries.push(where);

        const selected = stages.filter((stage) => {
          if (where.companyId !== ids.company) return false;
          if (where.id?.in) return where.id.in.includes(stage.id);
          if (where.pipelineId) return stage.pipelineId === where.pipelineId;
          if (where.pipeline) return stage.isDefaultPipeline;

          return true;
        });

        return Promise.resolve([...selected].sort((a, b) => a.position - b.position));
      },
    },
  };

  return {
    ids,
    stageQueries,
    dealUpdates,
    client,
    prisma: { ...client, $transaction: (fn: any) => fn(client) },
    reset() {
      deal = makeDeal();
      stageQueries.length = 0;
      dealUpdates.length = 0;
    },
    currentDeal: () => deal,
  };
});

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));
vi.mock("@/core/di", () => ({
  getCustomColumnRepo: () => ({ findByEntityType: () => Promise.resolve([]) }),
  getPipelineRepo: () => ({
    getFirstStageOfPipeline: (pipelineId: string) =>
      Promise.resolve(pipelineId === fake.ids.renewalsPipeline ? fake.ids.renewalDue : fake.ids.qualified),
    findPipelineIdsByStageIds: (stageIds: Set<string>) =>
      Promise.resolve(
        new Map(
          [...stageIds].map((stageId): [string, string] => [
            stageId,
            stageId === fake.ids.renewalDue || stageId === fake.ids.renewalWon
              ? fake.ids.renewalsPipeline
              : fake.ids.newBusinessPipeline,
          ]),
        ),
      ),
  }),
}));

import { createMockUser } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { DomainEvent } from "@/features/event/domain-events";
import { DealStageHistoryListener } from "../listener/deal-stage-history.listener";
import { PrismaDealRepo } from "../prisma-deal.repository";

const user = createMockUser({ companyId: fake.ids.company });

function withTenant<T>(run: () => Promise<T>) {
  return runWithTenant(user, run);
}

function groupOptions(filters?: Filter[]) {
  return withTenant(() => new PrismaDealRepo().getGroupOptions(filters));
}

function makeHistoryRepo() {
  return {
    findOpenStageHistory: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000070",
      toStageId: fake.ids.qualified,
      enteredAt: new Date("2026-09-01T00:00:00.000Z"),
    }),
    closeStageHistory: vi.fn().mockResolvedValue(undefined),
    openStageHistory: vi.fn().mockResolvedValue(undefined),
  };
}

describe("PrismaDealRepo group options", () => {
  beforeEach(() => fake.reset());

  it("falls back to the default pipeline when no pipeline is selected", async () => {
    const options = await groupOptions();

    expect(options.map((option) => option.value)).toEqual([fake.ids.qualified, fake.ids.proposal]);
    expect(fake.stageQueries[0]).toEqual(expect.objectContaining({ pipeline: { isDefault: true, archivedAt: null } }));
  });

  it("scopes the stages to the pipeline named by an equals filter", async () => {
    const options = await groupOptions([
      { field: "pipelineId", operator: FilterOperatorKey.equals, value: fake.ids.renewalsPipeline },
    ]);

    expect(options.map((option) => option.value)).toEqual([fake.ids.renewalDue, fake.ids.renewalWon]);
    expect(options.map((option) => option.label)).toEqual(["Renewal due", "Renewed"]);
    expect(fake.stageQueries[0]).toEqual({ companyId: fake.ids.company, pipelineId: fake.ids.renewalsPipeline });
  });

  it("scopes the stages to a single-valued in filter", async () => {
    const options = await groupOptions([
      { field: "pipelineId", operator: FilterOperatorKey.in, value: [fake.ids.renewalsPipeline] },
    ]);

    expect(options.map((option) => option.value)).toEqual([fake.ids.renewalDue, fake.ids.renewalWon]);
  });

  it("keeps the default pipeline for filters that name no single pipeline", async () => {
    const options = await groupOptions([
      {
        field: "pipelineId",
        operator: FilterOperatorKey.in,
        value: [fake.ids.renewalsPipeline, fake.ids.newBusinessPipeline],
      },
      { field: "name", operator: FilterOperatorKey.contains, value: "acme" },
    ]);

    expect(options.map((option) => option.value)).toEqual([fake.ids.qualified, fake.ids.proposal]);
  });
});

describe("moving a deal to another pipeline", () => {
  beforeEach(() => fake.reset());

  it("lands the deal on the target pipeline's first stage and records the stage history", async () => {
    const updated = await withTenant(() =>
      new PrismaDealRepo().updateDealOrThrow({ id: fake.ids.deal, pipelineId: fake.ids.renewalsPipeline }),
    );

    expect(updated.pipelineId).toBe(fake.ids.renewalsPipeline);
    expect(updated.stageId).toBe(fake.ids.renewalDue);

    const [{ where, data }] = fake.dealUpdates as any[];

    expect(where).toEqual(expect.objectContaining({ id: fake.ids.deal, companyId: fake.ids.company }));
    expect(data.stageId).toBe(fake.ids.renewalDue);
    expect(data.stageEnteredAt).toBeInstanceOf(Date);

    const historyRepo = makeHistoryRepo();

    await new DealStageHistoryListener(historyRepo as unknown as DealStageHistoryRepo).handle(
      DomainEvent.DEAL_UPDATED,
      {
        userId: user.id,
        companyId: fake.ids.company,
        entityId: fake.ids.deal,
        payload: {
          deal: updated,
          changes: {
            pipelineId: { previous: fake.ids.newBusinessPipeline, current: fake.ids.renewalsPipeline },
            stageId: { previous: fake.ids.qualified, current: fake.ids.renewalDue },
          },
        },
      } as unknown as DomainEventMap[DomainEvent.DEAL_UPDATED],
    );

    expect(historyRepo.closeStageHistory).toHaveBeenCalledTimes(1);
    expect(historyRepo.openStageHistory).toHaveBeenCalledExactlyOnceWith({
      dealId: fake.ids.deal,
      fromStageId: fake.ids.qualified,
      toStageId: fake.ids.renewalDue,
      enteredAt: updated.stageEnteredAt,
      userId: user.id,
    });
  });

  it("leaves the placement alone when the pipeline does not change", async () => {
    await withTenant(() =>
      new PrismaDealRepo().updateDealOrThrow({ id: fake.ids.deal, pipelineId: fake.ids.newBusinessPipeline }),
    );

    const [{ data }] = fake.dealUpdates as any[];

    expect(data.stageId).toBeUndefined();
    expect(fake.currentDeal().stageId).toBe(fake.ids.qualified);
  });
});
