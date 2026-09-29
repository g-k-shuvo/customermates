import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "vitest-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
    EMAIL_TRANSPORT: "console",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { BulkJobStatus } = await import("@/generated/prisma");
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("contact lists", () => {
  const companyId = randomUUID();
  const marker = `Fill${randomUUID().slice(0, 8)}`;
  let userId: string;
  const contactIds: string[] = [];
  let outsiderId: string;

  beforeAll(async () => {
    vi.spyOn(BackgroundTaskService.prototype, "dispatch").mockResolvedValue(undefined);
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      userId = (
        await prisma.user.create({
          data: {
            companyId,
            roleId: role.id,
            email: `owner-${randomUUID()}@example.invalid`,
            firstName: "Owner",
            lastName: "Tester",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
      for (let index = 0; index < 205; index += 1) {
        const contact = await prisma.contact.create({
          data: {
            companyId,
            firstName: marker,
            lastName: `Person ${index}`,
            identifiers:
              index === 0
                ? { create: { companyId, provider: "mail", channelClass: "email", value: "first@list.example" } }
                : undefined,
          },
          select: { id: true },
        });
        contactIds.push(contact.id);
      }
      await prisma.contact.create({ data: { companyId, firstName: "Someone", lastName: "Else" } });
      const other = await prisma.company.create({ data: {} });
      outsiderId = (
        await prisma.contact.create({ data: { companyId: other.id, firstName: "Other", lastName: "Tenant" } })
      ).id;
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await runWithoutTenant(async () => {
      const outsider = await prisma.contact.findUnique({ where: { id: outsiderId }, select: { companyId: true } });
      await prisma.company.deleteMany({ where: { id: { in: [companyId, outsider?.companyId ?? companyId] } } });
    });
    await prisma.$disconnect();
  });

  const as = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(userId, fn);

  it("creates lists with unique names and changes members by hand, skipping other tenants' contacts", async () => {
    const created = await as(() =>
      di.getCreateContactListInteractor().invoke({ name: "Higher Ed", description: null }),
    );
    if (!created.ok) throw new Error("not created");
    expect(created.data).toMatchObject({ name: "Higher Ed", memberCount: 0 });

    expect((await as(() => di.getCreateContactListInteractor().invoke({ name: "higher ed" }))).ok).toBe(false);

    const added = await as(() =>
      di
        .getAddContactListMembersInteractor()
        .invoke({ id: created.data.id, contactIds: [...contactIds.slice(0, 3), outsiderId] }),
    );
    expect(added).toEqual({ ok: true, data: { changed: 3 } });
    const again = await as(() =>
      di.getAddContactListMembersInteractor().invoke({ id: created.data.id, contactIds: contactIds.slice(0, 3) }),
    );
    expect(again).toEqual({ ok: true, data: { changed: 0 } });

    const members = await as(() => di.getGetContactListMembersInteractor().invoke({ id: created.data.id }));
    expect(members.ok && members.data.total).toBe(3);
    expect(members.ok && members.data.items.find((item) => item.contactId === contactIds[0])?.email).toBe(
      "first@list.example",
    );

    const removed = await as(() =>
      di.getRemoveContactListMembersInteractor().invoke({ id: created.data.id, contactIds: [contactIds[1]] }),
    );
    expect(removed).toEqual({ ok: true, data: { changed: 1 } });

    const renamed = await as(() =>
      di
        .getUpdateContactListInteractor()
        .invoke({ id: created.data.id, name: "CDI Targets", description: "Higher Ed" }),
    );
    expect(renamed.ok && renamed.data).toMatchObject({ name: "CDI Targets", memberCount: 2 });

    const all = await as(() => di.getGetContactListsInteractor().invoke());
    expect(all.ok && all.data.map((list) => list.name)).toContain("CDI Targets");
  });

  it("fills a list from a filter in pages, keeping existing members once", async () => {
    const list = await as(() => di.getCreateContactListInteractor().invoke({ name: `Filled ${marker}` }));
    if (!list.ok) throw new Error("not created");
    await as(() => di.getAddContactListMembersInteractor().invoke({ id: list.data.id, contactIds: [contactIds[0]] }));

    const started = await as(() => di.getFillContactListInteractor().invoke({ id: list.data.id, searchTerm: marker }));
    if (!started.ok) throw new Error("not started");
    expect(started.data).toMatchObject({ status: BulkJobStatus.running, expectedTotal: 205 });

    expect(
      (await as(() => di.getFillContactListInteractor().invoke({ id: list.data.id, searchTerm: marker }))).ok,
    ).toBe(false);

    let cursor: string | null = null;
    do {
      const page = await as(() => di.getRunBulkJobPageInteractor().invoke({ jobId: started.data.id, cursor }));
      if (!page.ok) throw new Error("page failed");
      cursor = page.data.nextCursor;
    } while (cursor !== null);
    await as(() => di.getFinishBulkJobInteractor().invoke({ id: started.data.id }));

    const job = await as(() => di.getGetBulkJobInteractor().invoke({ id: started.data.id }));
    expect(job.ok && job.data).toMatchObject({ status: BulkJobStatus.completed, processed: 205, stale: false });
    const filled = await as(() => di.getGetContactListInteractor().invoke({ id: list.data.id }));
    expect(filled.ok && filled.data.memberCount).toBe(205);

    const deleted = await as(() => di.getDeleteContactListInteractor().invoke({ id: list.data.id }));
    expect(deleted.ok).toBe(true);
    expect(await runWithoutTenant(() => prisma.contactListMember.count({ where: { listId: list.data.id } }))).toBe(0);
    expect(await runWithoutTenant(() => prisma.contact.count({ where: { companyId, firstName: marker } }))).toBe(205);
  });
});
