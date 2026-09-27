import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("a deal's value is its base value plus its service lines", { timeout: 60_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const pipelineId = randomUUID();
  const qualifiedId = randomUUID();
  const serviceId = randomUUID();

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,$2,true,$3,CURRENT_TIMESTAMP)',
      [roleId, `role-${roleId}`, companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"Status",CURRENT_TIMESTAMP)',
      [userId, `user-${userId}@example.com`, "Base", "Value", companyId, roleId, "active"],
    );
    await client.query(
      'INSERT INTO "Pipeline" ("id","companyId","name","isDefault","updatedAt") VALUES ($1,$2,$3,true,CURRENT_TIMESTAMP)',
      [pipelineId, companyId, "Sales"],
    );
    for (const [id, name, position, probability, kind] of [
      [qualifiedId, "Qualified", 0, 40, "open"],
      [randomUUID(), "Won", 1, 100, "won"],
      [randomUUID(), "Lost", 2, 0, "lost"],
    ] as const) {
      await client.query(
        'INSERT INTO "PipelineStage" ("id","companyId","pipelineId","name","position","probability","kind","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"StageKind",CURRENT_TIMESTAMP)',
        [id, companyId, pipelineId, name, position, probability, kind],
      );
    }
    await client.query(
      'INSERT INTO "Service" ("id","name","amount","companyId","updatedAt") VALUES ($1,$2,150,$3,CURRENT_TIMESTAMP)',
      [serviceId, "Consulting day", companyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  const dealInput = <T extends object>(fields: { name: string } & T) => ({
    organizationIds: [],
    userIds: [],
    contactIds: [],
    services: [],
    taskIds: [],
    customFieldValues: [],
    ...fields,
  });

  const stored = async (dealId: string) =>
    (
      await client.query<{
        baseValue: number;
        totalValue: number;
        totalQuantity: number;
        weightedValue: number | null;
      }>('SELECT "baseValue", "totalValue", "totalQuantity", "weightedValue" FROM "Deal" WHERE "id" = $1', [dealId])
    ).rows[0];

  it("totals the base alone, the base with services, and the base again once the services go", async () => {
    const di = await import("@/core/di");

    const created = await runAsBackgroundTenant(userId, () =>
      di.getCreateDealInteractor().invoke(dealInput({ name: "Base only", baseValue: 1000, stageId: qualifiedId })),
    );
    expect(created.ok).toBe(true);
    const dealId = created.ok ? created.data.id : "";
    expect(created.ok && created.data).toMatchObject({ baseValue: 1000, totalValue: 1000, totalQuantity: 0 });
    expect(await stored(dealId)).toEqual({ baseValue: 1000, totalValue: 1000, totalQuantity: 0, weightedValue: 400 });

    const withServices = await runAsBackgroundTenant(userId, () =>
      di.getUpdateDealInteractor().invoke({ id: dealId, services: [{ serviceId, quantity: 2 }] }),
    );
    expect(withServices.ok && withServices.data).toMatchObject({ baseValue: 1000, totalValue: 1300, totalQuantity: 2 });

    const rebased = await runAsBackgroundTenant(userId, () =>
      di.getUpdateDealInteractor().invoke({ id: dealId, baseValue: 500 }),
    );
    expect(rebased.ok && rebased.data).toMatchObject({ baseValue: 500, totalValue: 800, totalQuantity: 2 });
    expect(await stored(dealId)).toMatchObject({ weightedValue: 320 });

    const withoutServices = await runAsBackgroundTenant(userId, () =>
      di.getUpdateDealInteractor().invoke({ id: dealId, services: [] }),
    );
    expect(withoutServices.ok && withoutServices.data).toMatchObject({
      baseValue: 500,
      totalValue: 500,
      totalQuantity: 0,
    });
  });

  it("starts a deal without a base value at 0 and refuses a negative one", async () => {
    const di = await import("@/core/di");

    const servicesOnly = await runAsBackgroundTenant(userId, () =>
      di.getCreateDealInteractor().invoke(dealInput({ name: "Services only", services: [{ serviceId, quantity: 3 }] })),
    );
    expect(servicesOnly.ok && servicesOnly.data).toMatchObject({ baseValue: 0, totalValue: 450, totalQuantity: 3 });

    const negative = await runAsBackgroundTenant(userId, () =>
      di.getCreateDealInteractor().invoke(dealInput({ name: "Negative", baseValue: -1 })),
    );
    expect(negative.ok).toBe(false);
  });

  it("carries a converted lead's value into the deal's base value", async () => {
    const di = await import("@/core/di");

    const lead = await runAsBackgroundTenant(userId, () =>
      di.getCreateLeadInteractor().invoke({
        title: "Fifty thousand",
        value: 50_000,
        ownerUserId: userId,
        status: "new",
        sourceOrigin: "manual",
        labels: [],
        customFieldValues: [],
      }),
    );
    expect(lead.ok).toBe(true);

    const deal = await runAsBackgroundTenant(userId, () =>
      di.getConvertLeadToDealInteractor().invoke({ id: lead.ok ? lead.data.id : "", stageId: qualifiedId }),
    );
    expect(deal.ok && deal.data).toMatchObject({ baseValue: 50_000, totalValue: 50_000, totalQuantity: 0 });
    expect(await stored(deal.ok ? deal.data.id : "")).toMatchObject({ weightedValue: 20_000 });
  });

  it("lets the conversion set the deal's value, close date and probability instead of the lead's", async () => {
    const di = await import("@/core/di");

    const lead = await runAsBackgroundTenant(userId, () =>
      di.getCreateLeadInteractor().invoke({
        title: "Estimate",
        value: 50_000,
        ownerUserId: userId,
        status: "new",
        sourceOrigin: "manual",
        labels: [],
        customFieldValues: [],
      }),
    );

    const deal = await runAsBackgroundTenant(userId, () =>
      di.getConvertLeadToDealInteractor().invoke({
        id: lead.ok ? lead.data.id : "",
        name: "Signed estimate",
        stageId: qualifiedId,
        baseValue: 42_000,
        expectedCloseDate: new Date("2026-11-30T00:00:00.000Z"),
        probability: 75,
      }),
    );

    expect(deal.ok && deal.data).toMatchObject({
      name: "Signed estimate",
      baseValue: 42_000,
      totalValue: 42_000,
      probability: 75,
      weightedValue: 31_500,
    });
    expect(deal.ok && deal.data.expectedCloseDate?.toISOString()).toBe("2026-11-30T00:00:00.000Z");
  });
});
