import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SURFACE = "deals-card-store";
const OTHER_SURFACE = "contacts-card-store";

describeDatabase("shared saved views on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const outsiderId = randomUUID();

  const owner: TenantUser = createMockUser({ id: ownerId, companyId });
  const colleague: TenantUser = createMockUser({ id: colleagueId, companyId });
  const outsider: TenantUser = createMockUser({ id: outsiderId, companyId: foreignCompanyId });
  const as = <T>(user: TenantUser, fn: (repo: PrismaDataViewRepo) => Promise<T>) =>
    runWithTenant(user, () => fn(new PrismaDataViewRepo()));

  let privateId = "";
  let teamId = "";
  let otherSurfaceId = "";

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP), ($6, $7, $8, $9, $5, CURRENT_TIMESTAMP), ($10, $11, $12, $13, $14, CURRENT_TIMESTAMP)',
      [
        ownerId,
        `owner-${ownerId}@example.invalid`,
        "Ada",
        "Owner",
        companyId,
        colleagueId,
        `colleague-${colleagueId}@example.invalid`,
        "Cole",
        "League",
        outsiderId,
        `outsider-${outsiderId}@example.invalid`,
        "Otto",
        "Outside",
        foreignCompanyId,
      ],
    );

    privateId = (
      await as(owner, (repo) =>
        repo.createView({ surfaceKey: SURFACE, name: "Mine only", position: 0, state: { searchTerm: "private" } }),
      )
    ).id;
    teamId = (
      await as(owner, (repo) =>
        repo.createView({
          surfaceKey: SURFACE,
          name: "Team pipeline",
          position: 1,
          state: { searchTerm: "team" },
          shared: true,
        }),
      )
    ).id;
    otherSurfaceId = (
      await as(owner, (repo) =>
        repo.createView({ surfaceKey: OTHER_SURFACE, name: "Elsewhere", position: 0, state: {}, shared: true }),
      )
    ).id;
  });

  afterAll(async () => {
    await client.query('DELETE FROM "DataView" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "P13n" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("shows a colleague the shared view of this surface, named after its owner, and nothing private", async () => {
    const surface = await as(colleague, (repo) => repo.loadSurfaceState(SURFACE));

    expect(surface.views).toEqual([
      expect.objectContaining({ id: teamId, name: "Team pipeline", shared: true, sharedBy: "Ada Owner" }),
    ]);
    expect(surface.views[0].state.searchTerm).toBe("team");
  });

  it("keeps the owner's own list first-hand: both views, the shared one marked, none attributed to someone else", async () => {
    const views = await as(owner, (repo) => repo.listDataViews(SURFACE));

    expect(views.map((view) => [view.name, view.shared, view.sharedBy])).toEqual([
      ["Mine only", undefined, undefined],
      ["Team pipeline", true, undefined],
    ]);
  });

  it("never shows a view to another company, and never outside its surface", async () => {
    await expect(as(outsider, (repo) => repo.loadSurfaceState(SURFACE))).resolves.toMatchObject({ views: [] });
    await expect(as(outsider, (repo) => repo.findReadableOrNull(teamId))).resolves.toBeNull();
    await expect(as(colleague, (repo) => repo.listDataViews(OTHER_SURFACE))).resolves.toEqual([
      expect.objectContaining({ id: otherSurfaceId }),
    ]);
  });

  it("lets a colleague open the shared view but not the private one", async () => {
    await expect(as(colleague, (repo) => repo.findReadableOrNull(teamId))).resolves.toMatchObject({ id: teamId });
    await expect(as(colleague, (repo) => repo.findReadableOrNull(privateId))).resolves.toBeNull();
  });

  it("refuses every change a colleague tries on the shared view, and leaves it as the owner saved it", async () => {
    await expect(as(colleague, (repo) => repo.updateOwned({ id: teamId, name: "Hijacked" }))).resolves.toBeNull();
    await expect(
      as(colleague, (repo) => repo.updateOwnedState({ id: teamId, surfaceKey: SURFACE, state: { searchTerm: "x" } })),
    ).resolves.toBe(false);
    await expect(as(colleague, (repo) => repo.updateOwned({ id: teamId, shared: false }))).resolves.toBeNull();
    await expect(as(colleague, (repo) => repo.deleteOwned(teamId))).resolves.toBe(false);

    const stored = await client.query('SELECT name, "searchTerm", shared FROM "DataView" WHERE id = $1', [teamId]);
    expect(stored.rows).toEqual([{ name: "Team pipeline", searchTerm: "team", shared: true }]);
  });

  it("takes the view away from colleagues once the owner stops sharing it", async () => {
    await expect(as(owner, (repo) => repo.updateOwned({ id: teamId, shared: false }))).resolves.toMatchObject({
      id: teamId,
    });

    await expect(as(colleague, (repo) => repo.loadSurfaceState(SURFACE))).resolves.toMatchObject({ views: [] });
    await expect(as(colleague, (repo) => repo.findReadableOrNull(teamId))).resolves.toBeNull();
  });
});
