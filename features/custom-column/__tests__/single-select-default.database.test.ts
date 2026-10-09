import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: { APP_MODE: "self-hosted", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));
vi.mock("@/core/di", () => ({
  getDealRepo: () => ({ recalculateWeightedValuesForCompany: () => Promise.resolve() }),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { PrismaCustomColumnRepo } = await import("../prisma-custom-column.repository");
const { CustomColumnType, EntityType } = await import("@/generated/prisma");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("a single-select default applies to new records only", () => {
  const companyId = randomUUID();
  const user = createMockUser({ id: randomUUID(), companyId });
  const gold = randomUUID();
  const silver = randomUUID();
  const options = (defaultValue: string) => ({
    options: [
      { value: gold, label: "Gold", color: "warning" as const, isDefault: defaultValue === gold, index: 0 },
      { value: silver, label: "Silver", color: "secondary" as const, isDefault: defaultValue === silver, index: 1 },
    ],
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("leaves existing records unset when a default is chosen or the column is edited, and fills new ones", async () => {
    const existing = await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      return prisma.contact.create({ data: { companyId, firstName: "Existing", lastName: "Contact" } });
    });

    const repo = new PrismaCustomColumnRepo(new PrismaCompanyRepo());
    const column = await runWithTenant(user, () =>
      repo.upsertCustomColumnOrThrow({
        label: "Tier",
        type: CustomColumnType.singleSelect,
        entityType: EntityType.contact,
        options: options(gold),
      } as never),
    );
    await runWithTenant(user, () =>
      repo.upsertCustomColumnOrThrow({
        id: column.id,
        label: "Tier level",
        type: CustomColumnType.singleSelect,
        entityType: EntityType.contact,
        options: options(silver),
      } as never),
    );

    const fresh = await runWithoutTenant(() =>
      prisma.contact.create({ data: { companyId, firstName: "Fresh", lastName: "Contact" } }),
    );
    await runWithTenant(user, () => repo.writeValuesForCreate(EntityType.contact, fresh.id, []));

    const values = await runWithoutTenant(() =>
      prisma.customFieldValue.findMany({
        where: { companyId, columnId: column.id },
        select: { contactId: true, value: true },
      }),
    );

    expect(values).toEqual([{ contactId: fresh.id, value: silver }]);
    expect(values.some((value) => value.contactId === existing.id)).toBe(false);
  });
});
