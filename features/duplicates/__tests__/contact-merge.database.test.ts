import type { ZodError } from "zod";

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
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { serializeInteractorFailure } = await import("@/core/validation/validation.utils");
const { CustomErrorCode } = await import("@/core/validation/validation.types");
const { CustomColumnType, EntityType } = await import("@/generated/prisma");
const di = await import("@/core/di");

type Outcome = { ok: true; data: unknown } | { ok: false; error: ZodError };

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describeDatabase("merging contacts and undoing the merge", () => {
  const companyId = randomUUID();
  let admin: string;
  let owner: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      const user = (name: string) =>
        prisma.user
          .create({
            data: {
              companyId,
              roleId: role.id,
              email: `${name}-${randomUUID()}@example.invalid`,
              firstName: name,
              lastName: "Tester",
              status: "active",
            },
            select: { id: true },
          })
          .then((row) => row.id);
      admin = await user("admin");
      owner = await user("owner");

      const organization = await prisma.organization.create({
        data: { companyId, name: "Acme" },
        select: { id: true },
      });
      const sharedDeal = await prisma.deal.create({ data: { companyId, name: "Shared deal" }, select: { id: true } });
      const loserDeal = await prisma.deal.create({ data: { companyId, name: "Loser deal" }, select: { id: true } });
      const task = await prisma.task.create({
        data: { companyId, name: "Call Ada", type: "custom" },
        select: { id: true },
      });
      const tier = await prisma.customColumn.create({
        data: { companyId, label: "Tier", type: CustomColumnType.plain, entityType: EntityType.contact },
        select: { id: true },
      });
      const referral = await prisma.customColumn.create({
        data: {
          companyId,
          label: "Referral",
          type: CustomColumnType.relation,
          entityType: EntityType.deal,
          options: { targetEntityType: EntityType.contact },
        },
        select: { id: true },
      });

      const winner = await prisma.contact.create({
        data: {
          companyId,
          firstName: "A.",
          lastName: "Lovelace",
          notes: doc("winner note"),
          deals: { create: { companyId, dealId: sharedDeal.id } },
          customFieldValues: {
            create: {
              companyId,
              entityType: EntityType.contact,
              columnId: tier.id,
              type: CustomColumnType.plain,
              value: "gold",
            },
          },
        },
        select: { id: true },
      });
      const loser = await prisma.contact.create({
        data: {
          companyId,
          firstName: "Augusta Ada",
          lastName: "Lovelace",
          notes: doc("loser note"),
          identifiers: {
            create: { companyId, provider: "mail", channelClass: "email", value: `ada-${randomUUID()}@acme.example` },
          },
          organizations: { create: { companyId, organizationId: organization.id } },
          users: { create: { companyId, userId: owner } },
          deals: {
            create: [
              { companyId, dealId: sharedDeal.id },
              { companyId, dealId: loserDeal.id },
            ],
          },
          tasks: { create: { companyId, taskId: task.id } },
          customFieldValues: {
            create: {
              companyId,
              entityType: EntityType.contact,
              columnId: tier.id,
              type: CustomColumnType.plain,
              value: "silver",
            },
          },
        },
        select: { id: true },
      });
      const lead = await prisma.lead.create({
        data: { companyId, title: "Ada's lead", contactId: loser.id },
        select: { id: true },
      });
      await prisma.customFieldValue.create({
        data: {
          companyId,
          entityType: EntityType.deal,
          columnId: referral.id,
          type: CustomColumnType.relation,
          dealId: sharedDeal.id,
          value: loser.id,
          targetContactId: loser.id,
        },
      });

      Object.assign(ids, {
        winner: winner.id,
        loser: loser.id,
        organization: organization.id,
        sharedDeal: sharedDeal.id,
        loserDeal: loserDeal.id,
        task: task.id,
        tier: tier.id,
        lead: lead.id,
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const state = (contactId: string) =>
    runWithoutTenant(() =>
      prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          firstName: true,
          notes: true,
          identifiers: { select: { value: true } },
          organizations: { select: { organizationId: true } },
          users: { select: { userId: true } },
          deals: { select: { dealId: true }, orderBy: { dealId: "asc" } },
          tasks: { select: { taskId: true } },
          customFieldValues: { select: { columnId: true, value: true } },
          leads: { select: { id: true } },
          customFieldRefs: { select: { id: true } },
        },
      }),
    );

  it("moves everything the loser held onto the winner, keeps both notes, and applies the picks", async () => {
    const outcome = await runAsBackgroundTenant(admin, () =>
      di.getMergeContactsInteractor().invoke({
        winnerId: ids.winner,
        loserIds: [ids.loser],
        fields: { firstName: ids.loser, customFields: { [ids.tier]: ids.loser } },
      }),
    );
    expect(outcome.ok).toBe(true);

    expect(await state(ids.loser)).toBeNull();
    const winner = await state(ids.winner);
    expect(winner?.firstName).toBe("Augusta Ada");
    expect(JSON.stringify(winner?.notes)).toContain("winner note");
    expect(JSON.stringify(winner?.notes)).toContain("loser note");
    expect(winner?.identifiers).toHaveLength(1);
    expect(winner?.organizations).toEqual([{ organizationId: ids.organization }]);
    expect(winner?.users).toEqual([{ userId: owner }]);
    expect(winner?.deals.map((row) => row.dealId).sort()).toEqual([ids.sharedDeal, ids.loserDeal].sort());
    expect(winner?.tasks).toEqual([{ taskId: ids.task }]);
    expect(winner?.customFieldValues).toEqual([{ columnId: ids.tier, value: "silver" }]);
    expect(winner?.leads).toEqual([{ id: ids.lead }]);
    expect(winner?.customFieldRefs).toHaveLength(1);
  });

  it("undoes the merge once: the loser returns under its own id and the winner gets its own state back", async () => {
    const merges = await runAsBackgroundTenant(admin, () => di.getGetContactMergesInteractor().invoke());
    const merge = merges.ok ? merges.data[0] : undefined;
    expect(merge).toMatchObject({ undoable: true, loserNames: ["Augusta Ada Lovelace"] });

    const undone = await runAsBackgroundTenant(admin, () =>
      di.getUndoContactMergeInteractor().invoke({ id: merge?.id ?? "" }),
    );
    expect(undone.ok).toBe(true);

    const loser = await state(ids.loser);
    expect(loser?.firstName).toBe("Augusta Ada");
    expect(loser?.identifiers).toHaveLength(1);
    expect(loser?.organizations).toEqual([{ organizationId: ids.organization }]);
    expect(loser?.users).toEqual([{ userId: owner }]);
    expect(loser?.deals.map((row) => row.dealId).sort()).toEqual([ids.sharedDeal, ids.loserDeal].sort());
    expect(loser?.customFieldValues).toEqual([{ columnId: ids.tier, value: "silver" }]);
    expect(loser?.leads).toEqual([{ id: ids.lead }]);
    expect(loser?.customFieldRefs).toHaveLength(1);

    const winner = await state(ids.winner);
    expect(winner?.firstName).toBe("A.");
    expect(JSON.stringify(winner?.notes)).not.toContain("loser note");
    expect(winner?.identifiers).toEqual([]);
    expect(winner?.organizations).toEqual([]);
    expect(winner?.users).toEqual([]);
    expect(winner?.deals).toEqual([{ dealId: ids.sharedDeal }]);
    expect(winner?.customFieldValues).toEqual([{ columnId: ids.tier, value: "gold" }]);

    const again = (await runAsBackgroundTenant(admin, () =>
      di.getUndoContactMergeInteractor().invoke({ id: merge?.id ?? "" }),
    )) as Outcome;
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(serializeInteractorFailure(again.error).issues.map((issue) => issue.customCode)).toEqual([
        CustomErrorCode.contactMergeNotUndoable,
      ]);
    }
  });

  it("refuses a pick from outside the merge and a winner listed as a loser", async () => {
    const outside = (await runAsBackgroundTenant(admin, () =>
      di.getMergeContactsInteractor().invoke({
        winnerId: ids.winner,
        loserIds: [ids.loser],
        fields: { lastName: randomUUID() },
      }),
    )) as Outcome;
    const self = (await runAsBackgroundTenant(admin, () =>
      di.getMergeContactsInteractor().invoke({ winnerId: ids.winner, loserIds: [ids.winner] }),
    )) as Outcome;

    const codes = (outcome: Outcome) =>
      outcome.ok ? [] : serializeInteractorFailure(outcome.error).issues.map((issue) => issue.customCode);
    expect(codes(outside)).toEqual([CustomErrorCode.contactMergePickNotMember]);
    expect(codes(self)).toEqual([CustomErrorCode.contactMergeWinnerIsLoser]);
    expect(await state(ids.loser)).not.toBeNull();
  });
});
