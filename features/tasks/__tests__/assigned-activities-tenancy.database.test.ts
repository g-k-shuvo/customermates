import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaTaskRepo } from "../prisma-task.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("counting the activities assigned to the signed-in user", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });

  const companyId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,$2,true,$3,CURRENT_TIMESTAMP)',
      [roleId, `role-${roleId}`, companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"Status",CURRENT_TIMESTAMP)',
      [userId, `user-${userId}@example.com`, "Tenant", "Probe", companyId, roleId, "active"],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "UserRole" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("keeps companyId where the tenant guard can see it, rather than nested inside AND", async () => {
    const now = new Date();
    const dayEndsAt = new Date(now.getTime() + 60 * 60 * 1000);

    const counts = await runAsBackgroundTenant(userId, () =>
      new PrismaTaskRepo().countAssignedActivities({ now, dayEndsAt }),
    );

    expect(counts).toEqual({ overdue: 0, dueToday: 0 });
  });
});
