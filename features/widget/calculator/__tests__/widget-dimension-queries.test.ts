import { describe, it, expect, beforeEach, vi } from "vitest";

const fake = vi.hoisted(() => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const groupByCalls: Array<Record<string, unknown>> = [];
  const findManyCalls: Array<Record<string, unknown>> = [];

  const state = {
    rawRows: [] as unknown[],
    lostStageIds: [] as string[],
    groupByRows: [] as unknown[],
    dealRows: [] as unknown[],
  };

  const client = {
    $queryRawUnsafe: (text: string, ...params: unknown[]) => {
      calls.push({ text, params });
      return Promise.resolve(state.rawRows);
    },
    pipelineStage: {
      findMany: () => Promise.resolve(state.lostStageIds.map((id) => ({ id }))),
    },
    user: {
      findMany: () =>
        Promise.resolve([
          { id: "user-b", firstName: "Bea", lastName: "Bell", email: "bea@example.com" },
          { id: "user-a", firstName: "", lastName: "", email: "anon@example.com" },
        ]),
    },
    lostReason: {
      findMany: () => Promise.resolve([{ id: "reason-1", name: "Price", position: 0 }]),
    },
    deal: {
      groupBy: (args: Record<string, unknown>) => {
        groupByCalls.push(args);
        return Promise.resolve(state.groupByRows);
      },
      findMany: (args: Record<string, unknown>) => {
        findManyCalls.push(args);
        return Promise.resolve(state.dealRows);
      },
    },
  };

  return { calls, groupByCalls, findManyCalls, state, prisma: { ...client, $transaction: (fn: never) => fn } };
});

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("@/prisma/db", () => ({ prisma: fake.prisma }));
vi.mock("@/core/di", () => ({
  getContactRepo: () => ({}),
  getOrganizationRepo: () => ({}),
  getDealRepo: () => ({ buildQueryArgs: () => Promise.resolve({ where: { companyId: "test-company-id" } }) }),
  getServiceRepo: () => ({}),
  getTaskRepo: () => ({}),
}));

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { Action, DealStatus, EntityType, Resource, WidgetGroupByType } from "@/generated/prisma";
import { WidgetDataFetcher } from "../widget-data-fetcher.service";

const WINDOW = { from: new Date("2026-01-01T00:00:00.000Z"), to: new Date("2026-04-01T00:00:00.000Z") };

const readAllUser = createMockUser();
const readOwnUser = createMockUserWithPermissions([{ resource: Resource.deals, action: Action.readOwn }]);
const noAccessUser = createMockUserWithPermissions([]);

function widget(groupByType: WidgetGroupByType) {
  return {
    aggregationType: "winRate" as const,
    dealFilters: [],
    entityFilters: [],
    entityType: EntityType.deal,
    groupByCustomColumnId: null,
    groupByType,
    periodDays: null,
    displayOptions: null,
  };
}

function lastCall() {
  const call = fake.calls.at(-1);
  if (!call) throw new Error("no raw query was issued");

  return call;
}

function highestPlaceholder(text: string): number {
  return [...text.matchAll(/\$(\d+)/g)].reduce((highest, match) => Math.max(highest, Number(match[1])), 0);
}

async function aggregates(groupByType: WidgetGroupByType, user = readAllUser) {
  return await runWithTenant(user, () => new WidgetDataFetcher().getDealDimensionAggregates(groupByType, WINDOW));
}

async function winRateRows(groupByType: WidgetGroupByType, user = readAllUser) {
  return await runWithTenant(user, () => new WidgetDataFetcher().getWinRateRows(widget(groupByType), WINDOW));
}

async function ownerAggregates(user = readAllUser) {
  return await runWithTenant(user, () =>
    new WidgetDataFetcher().groupDealsByDealDimension(widget(WidgetGroupByType.dealOwner), WidgetGroupByType.dealOwner),
  );
}

beforeEach(() => {
  fake.calls.length = 0;
  fake.groupByCalls.length = 0;
  fake.findManyCalls.length = 0;
  fake.state.rawRows = [];
  fake.state.lostStageIds = [];
  fake.state.groupByRows = [];
  fake.state.dealRows = [];
  vi.clearAllMocks();
});

describe("deal dimension aggregate queries", () => {
  it("binds every value positionally and supplies exactly the parameters the statement reads", async () => {
    for (const dimension of [
      WidgetGroupByType.dealCloseMonth,
      WidgetGroupByType.dealExpectedCloseMonth,
      WidgetGroupByType.dealLostReason,
      WidgetGroupByType.dealStageLostAt,
    ]) {
      fake.state.lostStageIds = ["stage-lost"];
      await aggregates(dimension);

      const { text, params } = lastCall();

      expect(highestPlaceholder(text), dimension).toBe(params.length);
      expect(text, dimension).not.toContain("Prisma.sql");
      expect(text, dimension).not.toContain("undefined");
    }
  });

  it("keeps every month expression on the naive column, where no session time zone can shift a bucket", async () => {
    for (const dimension of [WidgetGroupByType.dealCloseMonth, WidgetGroupByType.dealExpectedCloseMonth]) {
      await aggregates(dimension);

      expect(lastCall().text, dimension).not.toContain("AT TIME ZONE");
    }
  });

  it("buckets the close month straight off the stored timestamp", async () => {
    await aggregates(WidgetGroupByType.dealCloseMonth);

    const { text, params } = lastCall();

    expect(text).toContain(`to_char(date_trunc('month', d."closedAt"), 'YYYY-MM')`);
    expect(text).toContain('AND d."closedAt" >= $4');
    expect(text).toContain('AND d."closedAt" < $5');
    expect(params.slice(1)).toEqual([DealStatus.won, DealStatus.lost, WINDOW.from, WINDOW.to]);
  });

  it("forecasts only open deals and bounds the expected close month by the window", async () => {
    await aggregates(WidgetGroupByType.dealExpectedCloseMonth);

    const { text, params } = lastCall();

    expect(text).toContain(`to_char(date_trunc('month', d."expectedCloseDate"), 'YYYY-MM')`);
    expect(text).toContain('AND d."status" = $2::"DealStatus"');
    expect(text).toContain('AND d."expectedCloseDate" >= $3');
    expect(text).toContain('AND d."expectedCloseDate" < $4');
    expect(params).toEqual(["test-company-id", DealStatus.open, WINDOW.from, WINDOW.to]);
  });

  it("recovers the stage a deal was lost at from the history row that moved it into a lost stage", async () => {
    fake.state.lostStageIds = ["stage-lost-a", "stage-lost-b"];

    await aggregates(WidgetGroupByType.dealStageLostAt);

    const { text, params } = lastCall();

    expect(text).toContain("LEFT JOIN LATERAL");
    expect(text).toContain('SELECT h."fromStageId" AS "stageId"');
    expect(text).toContain('WHERE h."dealId" = d."id" AND h."companyId" = $7 AND h."toStageId" IN ($5, $6)');
    expect(text).toContain('ORDER BY h."enteredAt" DESC');
    expect(text).toContain("LIMIT 1");
    expect(text).toContain(
      'COALESCE(lost."stageId", CASE WHEN d."stageId" IN ($5, $6) THEN NULL ELSE d."stageId" END)',
    );
    expect(text).toContain('AND d."status" = $2::"DealStatus"');
    expect(params).toEqual([
      "test-company-id",
      DealStatus.lost,
      WINDOW.from,
      WINDOW.to,
      "stage-lost-a",
      "stage-lost-b",
      "test-company-id",
    ]);
  });

  it("falls back to the deal's own stage when the pipeline has no lost stage to move it into", async () => {
    fake.state.lostStageIds = [];

    await aggregates(WidgetGroupByType.dealStageLostAt);

    const { text, params } = lastCall();

    expect(text).toContain('SELECT d."stageId" AS "key"');
    expect(text).not.toContain("LATERAL");
    expect(params).toEqual(["test-company-id", DealStatus.lost, WINDOW.from, WINDOW.to]);
  });

  it("bounds both lost-outcome dimensions by the closing instant, so no report reads all time", async () => {
    for (const dimension of [WidgetGroupByType.dealLostReason, WidgetGroupByType.dealStageLostAt]) {
      await aggregates(dimension);

      const { text } = lastCall();

      expect(text, dimension).toContain('AND d."status" = $2::"DealStatus"');
      expect(text, dimension).toContain('AND d."closedAt" >= $3');
      expect(text, dimension).toContain('AND d."closedAt" < $4');
    }
  });

  it("groups lost deals straight off the deal row for the lost reason", async () => {
    await aggregates(WidgetGroupByType.dealLostReason);

    const { text, params } = lastCall();

    expect(text).toContain('SELECT d."lostReasonId" AS "key"');
    expect(params).toEqual(["test-company-id", DealStatus.lost, WINDOW.from, WINDOW.to]);
  });

  it("restricts a readOwn viewer to their own deals and shuts a viewer without deal access out entirely", async () => {
    await aggregates(WidgetGroupByType.dealCloseMonth, readOwnUser);

    const own = lastCall();
    expect(own.text).toContain('EXISTS (SELECT 1 FROM "DealUser" du WHERE du."dealId" = d."id" AND du."userId" = $6)');
    expect(own.params.at(-1)).toBe("test-user-id");
    expect(own.text).not.toContain("$7");

    await aggregates(WidgetGroupByType.dealCloseMonth, noAccessUser);

    expect(lastCall().text).toContain("AND FALSE");
  });

  it("returns zeroed sums rather than nulls when a group has no monetary value", async () => {
    fake.state.rawRows = [{ key: "reason-1", count: 2, totalValue: null, totalQuantity: null, weightedValue: null }];

    await expect(aggregates(WidgetGroupByType.dealLostReason)).resolves.toEqual([
      { key: "reason-1", count: 2, totalValue: 0, totalQuantity: 0, weightedValue: 0 },
    ]);
  });
});

describe("deal dimension aggregates by owner", () => {
  it("reads owners through the filtered deal query rather than an unfiltered raw statement", async () => {
    await ownerAggregates();

    expect(fake.calls).toHaveLength(0);
    expect(fake.findManyCalls.at(-1)?.where).toEqual({
      companyId: "test-company-id",
      AND: [{ companyId: "test-company-id" }, { companyId: "test-company-id" }],
    });
  });

  it("counts a deal once per assignee and keeps an unassigned deal in its own bucket", async () => {
    fake.state.dealRows = [
      { totalValue: 100, totalQuantity: 1, weightedValue: 50, users: [{ userId: "user-a" }, { userId: "user-b" }] },
      { totalValue: 40, totalQuantity: 2, weightedValue: null, users: [] },
      { totalValue: 10, totalQuantity: 1, weightedValue: 5, users: [{ userId: "user-a" }] },
    ];

    await expect(ownerAggregates()).resolves.toEqual([
      { key: "user-a", count: 2, totalValue: 110, totalQuantity: 2, weightedValue: 55 },
      { key: "user-b", count: 1, totalValue: 100, totalQuantity: 1, weightedValue: 50 },
      { key: null, count: 1, totalValue: 40, totalQuantity: 2, weightedValue: 0 },
    ]);
  });
});

describe("deal dimension win rate rows", () => {
  it("splits won from lost per group and keeps both the count and the value of each side", async () => {
    fake.state.rawRows = [
      { key: "2026-01", status: DealStatus.won, count: 3, value: 3000 },
      { key: "2026-01", status: DealStatus.lost, count: 1, value: 500 },
      { key: "2026-02", status: DealStatus.lost, count: 2, value: 4000 },
    ];

    await expect(winRateRows(WidgetGroupByType.dealCloseMonth)).resolves.toEqual([
      { key: "2026-01", wonCount: 3, lostCount: 1, wonValue: 3000, lostValue: 500 },
      { key: "2026-02", wonCount: 0, lostCount: 2, wonValue: 0, lostValue: 4000 },
    ]);
  });

  it("splits an owner win rate per assignee and keeps unassigned closes under their own key", async () => {
    fake.state.dealRows = [
      { status: DealStatus.won, totalValue: 3000, users: [{ userId: "user-a" }, { userId: "user-b" }] },
      { status: DealStatus.lost, totalValue: 500, users: [{ userId: "user-a" }] },
      { status: DealStatus.lost, totalValue: 4000, users: [] },
    ];

    await expect(winRateRows(WidgetGroupByType.dealOwner)).resolves.toEqual([
      { key: "user-a", wonCount: 1, lostCount: 1, wonValue: 3000, lostValue: 500 },
      { key: "user-b", wonCount: 1, lostCount: 0, wonValue: 3000, lostValue: 0 },
      { key: null, wonCount: 0, lostCount: 1, wonValue: 0, lostValue: 4000 },
    ]);

    expect(fake.calls).toHaveLength(0);
  });

  it("counts every closed deal exactly once in the ungrouped totals a headline is read from", async () => {
    fake.state.groupByRows = [
      { status: DealStatus.won, _count: { _all: 1 }, _sum: { totalValue: 3000 } },
      { status: DealStatus.lost, _count: { _all: 2 }, _sum: { totalValue: 4500 } },
    ];

    await expect(
      runWithTenant(readAllUser, () =>
        new WidgetDataFetcher().getWinRateTotals(widget(WidgetGroupByType.dealOwner), WINDOW),
      ),
    ).resolves.toEqual({ key: null, wonCount: 1, lostCount: 2, wonValue: 3000, lostValue: 4500 });

    expect(fake.groupByCalls.at(-1)?.by).toEqual(["status"]);
  });

  it("bounds the win rate window by closedAt and excludes open deals from the denominator", async () => {
    await winRateRows(WidgetGroupByType.dealCloseMonth);

    const { text } = lastCall();

    expect(text).toContain('AND d."status" IN ($2::"DealStatus", $3::"DealStatus")');
    expect(text).toContain('AND d."closedAt" >= $4');
    expect(text).toContain('AND d."closedAt" < $5');
    expect(text).toContain('GROUP BY 1, d."status"');
  });

  it("leaves pipeline grouping on the typed Prisma aggregate rather than raw SQL", async () => {
    await winRateRows(WidgetGroupByType.dealPipeline);

    expect(fake.calls).toHaveLength(0);
    expect(fake.groupByCalls.at(-1)?.by).toEqual(["pipelineId", "status"]);
  });
});

describe("deal dimension label sources", () => {
  it("groups stage widgets with the typed aggregate, which keeps widget filters working", async () => {
    fake.state.groupByRows = [
      { stageId: "stage-1", _count: { _all: 4 }, _sum: { totalValue: 40, totalQuantity: 0, weightedValue: null } },
    ];

    await expect(
      runWithTenant(readAllUser, () =>
        new WidgetDataFetcher().groupDealsByDealDimension(
          widget(WidgetGroupByType.dealStage),
          WidgetGroupByType.dealStage,
        ),
      ),
    ).resolves.toEqual([{ key: "stage-1", count: 4, totalValue: 40, totalQuantity: 0, weightedValue: 0 }]);

    expect(fake.groupByCalls.at(-1)?.by).toEqual(["stageId"]);
    expect(fake.calls).toHaveLength(0);
  });

  it("labels owners by name and falls back to the address when a member has no name yet", async () => {
    await expect(runWithTenant(readAllUser, () => new WidgetDataFetcher().getOwnerPositions())).resolves.toEqual([
      { id: "user-b", name: "Bea Bell", position: 0 },
      { id: "user-a", name: "anon@example.com", position: 1 },
    ]);
  });

  it("labels lost reasons in their configured order", async () => {
    await expect(runWithTenant(readAllUser, () => new WidgetDataFetcher().getLostReasonPositions())).resolves.toEqual([
      { id: "reason-1", name: "Price", position: 0 },
    ]);
  });
});
