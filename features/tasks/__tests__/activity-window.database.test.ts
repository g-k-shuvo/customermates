import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaTaskRepo } from "../prisma-task.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const WINDOW = { from: new Date("2026-09-21T00:00:00.000Z"), to: new Date("2026-09-28T00:00:00.000Z") };
const LIMITS = { datedLimit: 500, undatedLimit: 50 };

describeDatabase("the activity window behind the week calendar", { timeout: 30_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const adminRoleId = randomUUID();
  const ownRoleId = randomUUID();
  const adminId = randomUUID();
  const ownerId = randomUUID();
  const tasks = {
    adminsInWeek: randomUUID(),
    ownersInWeek: randomUUID(),
    afterWeek: randomUUID(),
    atWeekEnd: randomUUID(),
    ownersUndated: randomUUID(),
    completedUndated: randomUUID(),
  };

  async function insertTask(
    id: string,
    name: string,
    dueAt: Date | null,
    assignee: string,
    completedAt: Date | null = null,
  ) {
    await client.query(
      'INSERT INTO "Task" ("id","companyId","type","name","dueAt","completedAt","updatedAt") VALUES ($1,$2,$3::"TaskType",$4,$5,$6,CURRENT_TIMESTAMP)',
      [id, companyId, "custom", name, dueAt?.toISOString() ?? null, completedAt?.toISOString() ?? null],
    );
    await client.query(
      'INSERT INTO "TaskUser" ("id","taskId","userId","companyId","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)',
      [randomUUID(), id, assignee, companyId],
    );
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP)', [companyId]);
    for (const [roleId, system] of [
      [adminRoleId, true],
      [ownRoleId, false],
    ] as const) {
      await client.query(
        'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)',
        [roleId, `role-${roleId}`, system, companyId],
      );
    }
    await client.query(
      'INSERT INTO "RolePermission" ("id","roleId","companyId","resource","action") VALUES ($1,$2,$3,$4::"Resource",$5::"Action")',
      [randomUUID(), ownRoleId, companyId, "tasks", "readOwn"],
    );
    for (const [userId, roleId] of [
      [adminId, adminRoleId],
      [ownerId, ownRoleId],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"Status",CURRENT_TIMESTAMP)',
        [userId, `user-${userId}@example.com`, "Week", "Probe", companyId, roleId, "active"],
      );
    }

    await insertTask(tasks.adminsInWeek, "Admin call", new Date("2026-09-23T10:00:00.000Z"), adminId);
    await insertTask(tasks.ownersInWeek, "Owner meeting", new Date("2026-09-22T08:30:00.000Z"), ownerId);
    await insertTask(tasks.afterWeek, "Next week", new Date("2026-09-29T09:00:00.000Z"), adminId);
    await insertTask(tasks.atWeekEnd, "Exactly at the end", WINDOW.to, adminId);
    await insertTask(tasks.ownersUndated, "Someday", null, ownerId);
    await insertTask(tasks.completedUndated, "Done already", null, adminId, new Date("2026-09-20T00:00:00.000Z"));
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Task" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "UserRole" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  const windowFor = (userId: string, onlyMine: boolean, window: typeof WINDOW | null = WINDOW) =>
    runAsBackgroundTenant(userId, () => new PrismaTaskRepo().findActivityWindow({ window, onlyMine, ...LIMITS }));

  it("returns the week's activities in due order and excludes the exclusive end and later weeks", async () => {
    const result = await windowFor(adminId, false);

    expect(result.dated.map((task) => task.id)).toEqual([tasks.ownersInWeek, tasks.adminsInWeek]);
    expect(result.undated.map((task) => task.id)).toEqual([tasks.ownersUndated]);
    expect(result.undatedTotal).toBe(1);
  });

  it("narrows to the signed-in user's activities when only mine is on", async () => {
    const result = await windowFor(adminId, true);

    expect(result.dated.map((task) => task.id)).toEqual([tasks.adminsInWeek]);
    expect(result.undated).toEqual([]);
    expect(result.undatedTotal).toBe(0);
  });

  it("shows a read-own user only the activities assigned to them", async () => {
    const result = await windowFor(ownerId, false);

    expect(result.dated.map((task) => task.id)).toEqual([tasks.ownersInWeek]);
    expect(result.undated.map((task) => task.id)).toEqual([tasks.ownersUndated]);
  });

  it("returns no dated activities for an empty window but still lists the tray", async () => {
    const result = await windowFor(adminId, false, null);

    expect(result.dated).toEqual([]);
    expect(result.undatedTotal).toBe(1);
  });
});
