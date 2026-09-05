import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const SEED_MIGRATION = "20260905120001_seed_lost_reasons";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string) {
  return readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(migrationSql(name));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `seed_lost_reasons_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: databaseUrl });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    database = new Client({ connectionString: isolatedUrl.toString() });
    await database.connect();

    return await fn(database);
  } finally {
    await database?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

const COMPANY_A = "20000000-0000-4000-8000-000000000001";
const COMPANY_B = "20000000-0000-4000-8000-000000000002";

async function reasonsFor(client: Client, companyId: string) {
  const { rows } = await client.query(
    `SELECT "name", "position" FROM "LostReason" WHERE "companyId" = $1 ORDER BY "position"`,
    [companyId],
  );

  return rows;
}

describeDatabase("lost reason seed migration", () => {
  it("seeds every existing company once and stays a no-op on re-run", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const seedIndex = names.indexOf(SEED_MIGRATION);
      expect(seedIndex).toBeGreaterThan(-1);

      await applyMigrations(client, names.slice(0, seedIndex));

      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, now()), ($2, now())`, [
        COMPANY_A,
        COMPANY_B,
      ]);

      await client.query(migrationSql(SEED_MIGRATION));

      const expected = [
        { name: "Price", position: 0 },
        { name: "Lost to competitor", position: 1 },
        { name: "No budget", position: 2 },
        { name: "No decision", position: 3 },
        { name: "Bad timing", position: 4 },
      ];

      expect(await reasonsFor(client, COMPANY_A)).toEqual(expected);
      expect(await reasonsFor(client, COMPANY_B)).toEqual(expected);

      const before = await client.query(`SELECT count(*)::int AS total FROM "LostReason"`);
      expect(before.rows[0].total).toBe(10);

      await client.query(migrationSql(SEED_MIGRATION));

      const after = await client.query(`SELECT count(*)::int AS total FROM "LostReason"`);
      expect(after.rows[0].total).toBe(10);
      expect(await reasonsFor(client, COMPANY_A)).toEqual(expected);
    });
  }, 120_000);

  it("does not resurrect reasons a tenant deliberately removed", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const seedIndex = names.indexOf(SEED_MIGRATION);

      await applyMigrations(client, names.slice(0, seedIndex));
      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, now())`, [COMPANY_A]);
      await client.query(migrationSql(SEED_MIGRATION));

      await client.query(`DELETE FROM "LostReason" WHERE "companyId" = $1 AND "name" <> 'Price'`, [COMPANY_A]);

      await client.query(migrationSql(SEED_MIGRATION));

      expect(await reasonsFor(client, COMPANY_A)).toEqual([{ name: "Price", position: 0 }]);
    });
  }, 120_000);
});
