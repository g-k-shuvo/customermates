import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaProcessWebFormSubmissionRepo } from "../process/prisma-process-web-form-submission.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("finding a user who can own a lead follow-up task", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });

  const systemRoleCompanyId = randomUUID();
  const grantedCompanyId = randomUUID();
  const powerlessCompanyId = randomUUID();

  const systemRoleId = randomUUID();
  const grantedRoleId = randomUUID();
  const powerlessRoleId = randomUUID();

  const systemAdminId = randomUUID();
  const grantedUserId = randomUUID();
  const powerlessUserId = randomUUID();
  const inactiveUserId = randomUUID();

  const insertRole = (id: string, companyId: string, isSystemRole: boolean) =>
    client.query(
      'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)',
      [id, `role-${id}`, isSystemRole, companyId],
    );

  const insertUser = (id: string, roleId: string, companyId: string, status: string) =>
    client.query(
      'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"Status",CURRENT_TIMESTAMP)',
      [id, `user-${id}@example.com`, "Web", "Form", companyId, roleId, status],
    );

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP),($2,CURRENT_TIMESTAMP),($3,CURRENT_TIMESTAMP)',
      [systemRoleCompanyId, grantedCompanyId, powerlessCompanyId],
    );

    await insertRole(systemRoleId, systemRoleCompanyId, true);
    await insertRole(grantedRoleId, grantedCompanyId, false);
    await insertRole(powerlessRoleId, powerlessCompanyId, false);

    await client.query(
      'INSERT INTO "RolePermission" ("id","roleId","companyId","resource","action") VALUES ($1,$2,$3,$4::"Resource",$5::"Action")',
      [randomUUID(), grantedRoleId, grantedCompanyId, Resource.tasks, Action.create],
    );
    await client.query(
      'INSERT INTO "RolePermission" ("id","roleId","companyId","resource","action") VALUES ($1,$2,$3,$4::"Resource",$5::"Action")',
      [randomUUID(), powerlessRoleId, powerlessCompanyId, Resource.contacts, Action.readAll],
    );

    await insertUser(systemAdminId, systemRoleId, systemRoleCompanyId, "active");
    await insertUser(grantedUserId, grantedRoleId, grantedCompanyId, "active");
    await insertUser(powerlessUserId, powerlessRoleId, powerlessCompanyId, "active");
    await insertUser(inactiveUserId, grantedRoleId, grantedCompanyId, "inactive");
  });

  afterAll(async () => {
    const companies = [systemRoleCompanyId, grantedCompanyId, powerlessCompanyId];

    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "RolePermission" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "UserRole" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [companies]);
    await client.end();
  });

  it("accepts a system role, which carries no permission rows at all", async () => {
    const found = await new PrismaProcessWebFormSubmissionRepo().findTaskCapableUserIdUnscoped(systemRoleCompanyId);

    expect(found).toBe(systemAdminId);
  });

  it("accepts a role granted tasks.create explicitly", async () => {
    const found = await new PrismaProcessWebFormSubmissionRepo().findTaskCapableUserIdUnscoped(grantedCompanyId);

    expect(found).toBe(grantedUserId);
  });

  it("returns null when nobody in the company may create a task", async () => {
    const found = await new PrismaProcessWebFormSubmissionRepo().findTaskCapableUserIdUnscoped(powerlessCompanyId);

    expect(found).toBeNull();
  });
});
