import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    BASE_URL: "https://crm.example.test",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaInvitationRepo } = await import("../prisma-invitation.repository");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("email invitations", () => {
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const owner = createMockUser({ id: ownerId, companyId });
  const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const as = <T>(fn: () => Promise<T>) => runWithTenant(owner, fn);

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({ data: { companyId, name: `Invites ${randomUUID()}` } });
      await prisma.user.create({
        data: {
          id: ownerId,
          companyId,
          roleId: role.id,
          firstName: "Owner",
          lastName: "Tester",
          email: `owner-${ownerId}@example.com`,
          status: "active",
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("gives each address one link that a resend keeps and extends", async () => {
    const repo = new PrismaInvitationRepo();
    const first = await as(() =>
      repo.issueEmailInviteToken({ email: "ann@example.com", token: `ann-${randomUUID()}`, expiresAt: new Date() }),
    );
    const again = await as(() =>
      repo.issueEmailInviteToken({ email: "ann@example.com", token: `other-${randomUUID()}`, expiresAt: inAWeek }),
    );

    expect(again).toBe(first);
    const rows = await runWithoutTenant(() =>
      prisma.inviteToken.findMany({ where: { companyId, email: "ann@example.com" } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.expiresAt.getTime()).toBe(inAWeek.getTime());
  });

  it("never hands out a personal link as the shared workspace link", async () => {
    const shared = await as(() => new PrismaCompanyRepo().findUnexpiredToken());

    expect(shared).toBeNull();
  });

  it("lists invitations until the person joins, and revoking removes the link", async () => {
    const repo = new PrismaInvitationRepo();
    await as(() =>
      repo.issueEmailInviteToken({ email: "bob@example.com", token: `bob-${randomUUID()}`, expiresAt: inAWeek }),
    );
    await runWithoutTenant(async () => {
      const role = await prisma.userRole.findFirstOrThrow({ where: { companyId } });
      await prisma.user.create({
        data: {
          companyId,
          roleId: role.id,
          firstName: "Bob",
          lastName: "Joined",
          email: "Bob@Example.com",
          status: "pendingAuthorization",
        },
      });
    });

    const pending = await as(() => repo.findPendingInvitations());
    expect(pending.map((invitation) => invitation.email)).toEqual(["ann@example.com"]);

    const ann = pending[0];
    if (!ann) throw new Error("no invitation");
    await as(() => repo.deleteEmailInvitation(ann.id));

    expect(await as(() => repo.findEmailInvitation(ann.id))).toBeNull();
    expect(await as(() => repo.findPendingInvitations())).toEqual([]);
  });
});
