import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("lead events reach the webhooks subscribed to them", { timeout: 60_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const leadHook = "https://lead-hook.invalid/deliveries";
  const taskHook = "https://task-hook.invalid/deliveries";

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,$2,true,$3,CURRENT_TIMESTAMP)',
      [roleId, `role-${roleId}`, companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"Status",CURRENT_TIMESTAMP)',
      [userId, `user-${userId}@example.com`, "Lead", "Hooks", companyId, roleId, "active"],
    );
    for (const [url, events] of [
      [leadHook, ["lead.created", "lead.updated", "lead.deleted"]],
      [taskHook, ["task.created"]],
    ] as const) {
      await client.query(
        'INSERT INTO "Webhook" ("id","url","events","companyId","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)',
        [randomUUID(), url, events, companyId],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  const deliveries = async (url: string) =>
    (
      await client.query<{ event: string; body: { event: string; data: { entityId: string } } }>(
        'SELECT "event", "requestBody" AS body FROM "WebhookDelivery" WHERE "companyId" = $1 AND "url" = $2 ORDER BY "createdAt"',
        [companyId, url],
      )
    ).rows;

  it("delivers lead.created, lead.updated and lead.deleted, and nothing to a hook that did not subscribe", async () => {
    const di = await import("@/core/di");

    const created = await runAsBackgroundTenant(userId, () =>
      di.getCreateLeadInteractor().invoke({
        title: "Webhook lead",
        ownerUserId: userId,
        status: "new",
        sourceOrigin: "manual",
        labels: [],
        customFieldValues: [],
      }),
    );
    expect(created.ok).toBe(true);
    const leadId = created.ok ? created.data.id : "";

    const updated = await runAsBackgroundTenant(userId, () =>
      di.getUpdateLeadInteractor().invoke({ id: leadId, title: "Webhook lead renamed" }),
    );
    expect(updated.ok).toBe(true);

    const deleted = await runAsBackgroundTenant(userId, () => di.getDeleteLeadInteractor().invoke({ id: leadId }));
    expect(deleted.ok).toBe(true);

    const leadDeliveries = await deliveries(leadHook);
    expect(leadDeliveries.map((row) => row.event)).toEqual(["lead.created", "lead.updated", "lead.deleted"]);
    expect(leadDeliveries.every((row) => row.body.event === row.event && row.body.data.entityId === leadId)).toBe(true);
    expect(await deliveries(taskHook)).toEqual([]);
  });
});
