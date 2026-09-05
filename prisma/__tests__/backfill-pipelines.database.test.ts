import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const BACKFILL_MIGRATION = "20260904130000_backfill_pipelines_from_custom_column";
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
  const databaseName = `backfill_pipelines_${randomUUID().replaceAll("-", "")}`;
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

const LEGACY_COMPANY = "10000000-0000-4000-8000-000000000001";
const PLAIN_COMPANY = "10000000-0000-4000-8000-000000000002";
const WEIGHTING_COLUMN = "11000000-0000-4000-8000-000000000001";

const OPTIONS = [
  { value: "17000000-0000-4000-8000-000000000008", label: "Open", weight: 30 },
  { value: "17000000-0000-4000-8000-000000000009", label: "Won", weight: 100 },
  { value: "17000000-0000-4000-8000-000000000010", label: "Lost", weight: 0 },
];

const DEALS = [
  { id: "12000000-0000-4000-8000-000000000001", name: "Alpha", option: OPTIONS[0].value },
  { id: "12000000-0000-4000-8000-000000000002", name: "Bravo", option: OPTIONS[1].value },
  { id: "12000000-0000-4000-8000-000000000003", name: "Charlie", option: OPTIONS[1].value },
  { id: "12000000-0000-4000-8000-000000000004", name: "Delta", option: null },
  { id: "12000000-0000-4000-8000-000000000005", name: "Echo", option: "17000000-0000-4000-8000-00000000ffff" },
];

async function seedLegacyShape(client: Client) {
  await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, now()), ($2, now())`, [
    LEGACY_COMPANY,
    PLAIN_COMPANY,
  ]);

  await client.query(
    `INSERT INTO "CustomColumn" ("id", "label", "type", "entityType", "options", "companyId", "updatedAt")
     VALUES ($1, 'Status', 'singleSelect', 'deal', $2, $3, now())`,
    [WEIGHTING_COLUMN, JSON.stringify({ options: OPTIONS }), LEGACY_COMPANY],
  );

  await client.query(`UPDATE "Company" SET "dealWeightingColumnId" = $1 WHERE "id" = $2`, [
    WEIGHTING_COLUMN,
    LEGACY_COMPANY,
  ]);

  for (const deal of DEALS) {
    await client.query(
      `INSERT INTO "Deal" ("id", "name", "companyId", "updatedAt") VALUES ($1, $2, $3, timestamp '2026-01-01 00:00:00')`,
      [deal.id, deal.name, LEGACY_COMPANY],
    );

    if (deal.option) {
      await client.query(
        `INSERT INTO "CustomFieldValue" ("id", "entityType", "columnId", "type", "value", "dealId", "companyId", "updatedAt")
         VALUES ($1, 'deal', $2, 'singleSelect', $3, $4, $5, now())`,
        [randomUUID(), WEIGHTING_COLUMN, deal.option, deal.id, LEGACY_COMPANY],
      );
    }
  }
}

async function boardSnapshot(client: Client) {
  const { rows } = await client.query(
    `SELECT s."position", s."name", s."probability", count(d."id")::int AS deals
     FROM "Pipeline" p
     JOIN "PipelineStage" s ON s."pipelineId" = p."id"
     LEFT JOIN "Deal" d ON d."stageId" = s."id"
     WHERE p."companyId" = $1
     GROUP BY s."position", s."name", s."probability"
     ORDER BY s."position"`,
    [LEGACY_COMPANY],
  );

  return rows;
}

describeDatabase("pipeline backfill migration", () => {
  it("reproduces the legacy board exactly and is safe to re-run", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const backfillIndex = names.indexOf(BACKFILL_MIGRATION);
      expect(backfillIndex).toBeGreaterThan(-1);

      await applyMigrations(client, names.slice(0, backfillIndex));
      await seedLegacyShape(client);

      await client.query(migrationSql(BACKFILL_MIGRATION));

      expect(await boardSnapshot(client)).toEqual([
        { position: 0, name: "Open", probability: 30, deals: 3 },
        { position: 1, name: "Won", probability: 100, deals: 2 },
        { position: 2, name: "Lost", probability: 0, deals: 0 },
      ]);

      const placement = await client.query(
        `SELECT count(*) FILTER (WHERE "pipelineId" IS NOT NULL)::int AS placed,
                count(*) FILTER (WHERE "stageId" IS NULL)::int AS stageless,
                count(*) FILTER (WHERE "status" <> 'open')::int AS not_open,
                count(*) FILTER (WHERE "stageEnteredAt" IS DISTINCT FROM "updatedAt")::int AS wrong_entered_at
         FROM "Deal"`,
      );
      expect(placement.rows[0]).toEqual({ placed: DEALS.length, stageless: 0, not_open: 0, wrong_entered_at: 0 });

      const named = await client.query(`SELECT "name", "isDefault" FROM "Pipeline" WHERE "companyId" = $1`, [
        LEGACY_COMPANY,
      ]);
      expect(named.rows).toEqual([{ name: "Status", isDefault: true }]);

      const plain = await client.query(
        `SELECT p."name", s."name" AS stage, s."probability"
         FROM "Pipeline" p JOIN "PipelineStage" s ON s."pipelineId" = p."id"
         WHERE p."companyId" = $1`,
        [PLAIN_COMPANY],
      );
      expect(plain.rows).toEqual([{ name: "Sales", stage: "Open", probability: 0 }]);

      const legacyIntact = await client.query(
        `SELECT count(*)::int AS columns FROM "Company" c
         JOIN "CustomColumn" cc ON cc."id" = c."dealWeightingColumnId"`,
      );
      expect(legacyIntact.rows[0].columns).toBe(1);

      const before = await boardSnapshot(client);
      await client.query(migrationSql(BACKFILL_MIGRATION));

      expect(await boardSnapshot(client)).toEqual(before);

      const totals = await client.query(
        `SELECT (SELECT count(*)::int FROM "Pipeline") AS pipelines,
                (SELECT count(*)::int FROM "PipelineStage") AS stages`,
      );
      expect(totals.rows[0]).toEqual({ pipelines: 2, stages: 4 });
    });
  }, 120_000);
});
