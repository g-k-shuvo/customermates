import type { TenantUser } from "@/features/user/user.schema";
import type { WidgetForCalculation } from "../widget-calculator.types";
import type { Filter } from "@/core/base/base-get.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AggregationType, DealStatus, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { PrismaWidgetCalculatorRepo } from "../prisma-widget-calculator.repository";
import { WidgetDataFetcher, monthBucketSql } from "../widget-data-fetcher.service";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("deal dimension reporting on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const monthCompanyId = randomUUID();
  const annId = randomUUID();
  const bobId = randomUUID();
  const viewerId = randomUUID();
  const septemberDealId = randomUUID();

  const viewer: TenantUser = { ...createMockUser(), id: viewerId, companyId };
  const monthViewer: TenantUser = { ...createMockUser(), id: randomUUID(), companyId: monthCompanyId };

  const OPEN_ONLY: Filter[] = [
    FilterSchema.parse({
      field: FilterFieldKey.dealStatus,
      operator: FilterOperatorKey.in,
      value: [DealStatus.open],
    }),
  ];

  function widget(
    aggregationType: AggregationType,
    groupByType: WidgetGroupByType,
    entityFilters: Filter[] = [],
  ): WidgetForCalculation {
    return {
      aggregationType,
      dealFilters: [],
      entityFilters,
      entityType: EntityType.deal,
      groupByCustomColumnId: null,
      groupByType,
      periodDays: 30,
      displayOptions: null,
    };
  }

  async function insertUser(id: string, firstName: string) {
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [id, `${id}@example.com`, firstName, "Tester", companyId],
    );
  }

  async function insertDeal(deal: {
    id: string;
    name: string;
    status: DealStatus;
    totalValue: number;
    closedAt: string | null;
    assignees: string[];
    companyId?: string;
  }) {
    await client.query(
      `INSERT INTO "Deal" ("id", "name", "companyId", "status", "totalValue", "totalQuantity", "weightedValue", "closedAt", "updatedAt")
       VALUES ($1, $2, $3, $4::"DealStatus", $5, 1, $5, $6::timestamp, CURRENT_TIMESTAMP)`,
      [deal.id, deal.name, deal.companyId ?? companyId, deal.status, deal.totalValue, deal.closedAt],
    );

    for (const userId of deal.assignees) {
      await client.query(
        'INSERT INTO "DealUser" ("id", "dealId", "userId", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [randomUUID(), deal.id, userId, deal.companyId ?? companyId],
      );
    }
  }

  async function daysAgo(days: number): Promise<string> {
    const result = await client.query<{ moment: string }>(
      `SELECT to_char((now() AT TIME ZONE 'utc') - ($1 || ' days')::interval, 'YYYY-MM-DD HH24:MI:SS') AS "moment"`,
      [days],
    );

    return result.rows[0].moment;
  }

  async function monthBucketUnder(timeZone: string, expression: string): Promise<string> {
    await client.query(`SET TimeZone = '${timeZone}'`);
    const result = await client.query<{ bucket: string }>(
      `SELECT ${expression} AS "bucket" FROM "Deal" d WHERE d."id" = $1`,
      [septemberDealId],
    );
    await client.query("SET TimeZone = 'UTC'");

    return result.rows[0].bucket;
  }

  beforeAll(async () => {
    await client.connect();

    for (const id of [companyId, monthCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);

    await insertUser(annId, "Ann");
    await insertUser(bobId, "Bob");
    await insertUser(viewerId, "Zed");

    await insertDeal({
      id: randomUUID(),
      name: "Shared win",
      status: DealStatus.won,
      totalValue: 1000,
      closedAt: await daysAgo(5),
      assignees: [annId, bobId],
    });
    await insertDeal({
      id: randomUUID(),
      name: "Ann loss",
      status: DealStatus.lost,
      totalValue: 500,
      closedAt: await daysAgo(6),
      assignees: [annId],
    });
    await insertDeal({
      id: randomUUID(),
      name: "Nobody's loss",
      status: DealStatus.lost,
      totalValue: 400,
      closedAt: await daysAgo(7),
      assignees: [],
    });
    await insertDeal({
      id: randomUUID(),
      name: "Ann open",
      status: DealStatus.open,
      totalValue: 700,
      closedAt: null,
      assignees: [annId],
    });
    await insertDeal({
      id: randomUUID(),
      name: "Nobody's open",
      status: DealStatus.open,
      totalValue: 250,
      closedAt: null,
      assignees: [],
    });
    await insertDeal({
      id: septemberDealId,
      name: "Closed just after midnight UTC",
      status: DealStatus.won,
      totalValue: 900,
      closedAt: "2026-09-01 02:00:00",
      assignees: [],
      companyId: monthCompanyId,
    });
  });

  afterAll(async () => {
    for (const id of [companyId, monthCompanyId]) {
      await client.query('DELETE FROM "DealUser" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "Deal" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [id]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [id]);
    }

    await client.end();
  });

  it("reads one win rate per closed deal, however many people the deal was assigned to", async () => {
    const result = await runWithTenant(viewer, () =>
      new PrismaWidgetCalculatorRepo().calculateWidgetData(
        widget(AggregationType.winRate, WidgetGroupByType.dealOwner),
      ),
    );

    expect(result.dataSummary?.sampleSize).toBe(3);
    expect(result.dataSummary?.headline).toBeCloseTo(100 / 3, 6);
  });

  it("still rates each assignee on the deals they carry", async () => {
    const result = await runWithTenant(viewer, () =>
      new PrismaWidgetCalculatorRepo().calculateWidgetData(
        widget(AggregationType.winRate, WidgetGroupByType.dealOwner),
      ),
    );

    expect(result.data).toEqual([
      {
        labelKind: "literal",
        label: "Ann Tester",
        value: 50,
        metrics: { wonCount: 1, lostCount: 1, wonValue: 1000, lostValue: 500, sampleSize: 2 },
      },
      {
        labelKind: "literal",
        label: "Bob Tester",
        value: 100,
        metrics: { wonCount: 1, lostCount: 0, wonValue: 1000, lostValue: 0, sampleSize: 1 },
      },
      {
        labelKind: "system",
        systemLabelKey: "noGroup",
        value: 0,
        metrics: { wonCount: 0, lostCount: 1, wonValue: 0, lostValue: 400, sampleSize: 1 },
      },
    ]);
  });

  it("keeps a deal nobody is assigned to inside an owner-grouped value report", async () => {
    const result = await runWithTenant(viewer, () =>
      new PrismaWidgetCalculatorRepo().calculateWidgetData(
        widget(AggregationType.dealValue, WidgetGroupByType.dealOwner),
      ),
    );

    expect(result.data).toContainEqual({ labelKind: "system", systemLabelKey: "noGroup", value: 650 });
    expect(result.data).toContainEqual({ labelKind: "literal", label: "Ann Tester", value: 2200 });
  });

  it("narrows an owner-grouped value report to the deals the widget filter selects", async () => {
    const result = await runWithTenant(viewer, () =>
      new PrismaWidgetCalculatorRepo().calculateWidgetData(
        widget(AggregationType.dealValue, WidgetGroupByType.dealOwner, OPEN_ONLY),
      ),
    );

    expect(result.data).toEqual([
      { labelKind: "literal", label: "Ann Tester", value: 700 },
      { labelKind: "system", systemLabelKey: "noGroup", value: 250 },
    ]);
  });

  it("buckets a close by the calendar month it carries, whatever time zone the session runs in", async () => {
    const naive = monthBucketSql('d."closedAt"');

    await expect(monthBucketUnder("UTC", naive)).resolves.toBe("2026-09");
    await expect(monthBucketUnder("America/New_York", naive)).resolves.toBe("2026-09");
    await expect(monthBucketUnder("Pacific/Auckland", naive)).resolves.toBe("2026-09");
  });

  it("would move that bucket if the expression handed the naive column to a zoned type first", async () => {
    const zoned = monthBucketSql("d.\"closedAt\" AT TIME ZONE 'UTC'");

    await expect(monthBucketUnder("UTC", zoned)).resolves.toBe("2026-09");
    await expect(monthBucketUnder("America/New_York", zoned)).resolves.toBe("2026-08");
  });

  it("groups a close month off the stored timestamp when the aggregate runs for real", async () => {
    const window = { from: new Date("2026-08-01T00:00:00.000Z"), to: new Date("2026-10-01T00:00:00.000Z") };

    await expect(
      runWithTenant(monthViewer, () =>
        new WidgetDataFetcher().getDealDimensionAggregates(WidgetGroupByType.dealCloseMonth, window),
      ),
    ).resolves.toEqual([{ key: "2026-09", count: 1, totalValue: 900, totalQuantity: 1, weightedValue: 900 }]);
  });
});
