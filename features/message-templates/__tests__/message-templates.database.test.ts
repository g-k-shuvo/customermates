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
const { Action, EntityType, Resource } = await import("@/generated/prisma");
const di = await import("@/core/di");

type Outcome = { ok: true; data: unknown } | { ok: false; error: ZodError };

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const codes = (outcome: Outcome) =>
  outcome.ok ? [] : serializeInteractorFailure(outcome.error).issues.map((issue) => issue.customCode);

describeDatabase("message templates", () => {
  const companyId = randomUUID();
  let admin: string;
  let reader: string;
  let dealId: string;

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const adminRole = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      const readerRole = await prisma.userRole.create({
        data: {
          companyId,
          name: `Reader ${randomUUID()}`,
          permissions: { create: [{ companyId, resource: Resource.automations, action: Action.readAll }] },
        },
        select: { id: true },
      });
      const user = (roleId: string, name: string) =>
        prisma.user
          .create({
            data: {
              companyId,
              roleId,
              email: `${name}-${randomUUID()}@example.invalid`,
              firstName: name,
              lastName: "Tester",
              status: "active",
            },
            select: { id: true },
          })
          .then((row) => row.id);
      admin = await user(adminRole.id, "Max");
      reader = await user(readerRole.id, "Rita");
      const contact = await prisma.contact.create({ data: { companyId, firstName: "Anna", lastName: "Weber" } });
      dealId = (
        await prisma.deal.create({
          data: { companyId, name: "Rollout", contacts: { create: { companyId, contactId: contact.id } } },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const asAdmin = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(admin, fn);

  it("creates, lists, updates and deletes a template, with names unique regardless of case", async () => {
    const created = await asAdmin(() =>
      di.getCreateMessageTemplateInteractor().invoke({
        name: "Follow-up",
        kind: "transactional",
        subject: "About {{ deal.name }}",
        bodyMarkdown: 'Hi {{ contact.firstName | "there" }}',
      }),
    );
    if (!created.ok) throw new Error("create failed");

    const duplicate = (await asAdmin(() =>
      di
        .getCreateMessageTemplateInteractor()
        .invoke({ name: "follow-up", kind: "marketing", subject: "x", bodyMarkdown: "y" }),
    )) as Outcome;
    expect(codes(duplicate)).toEqual([CustomErrorCode.messageTemplateNameTaken]);

    const updated = await asAdmin(() =>
      di.getUpdateMessageTemplateInteractor().invoke({ id: created.data.id, kind: "marketing" }),
    );
    expect(updated).toMatchObject({ ok: true, data: { kind: "marketing", name: "Follow-up" } });

    const listed = await runAsBackgroundTenant(reader, () => di.getGetMessageTemplatesInteractor().invoke());
    expect(listed.ok && listed.data.map((template) => template.name)).toEqual(["Follow-up"]);

    const deleted = await asAdmin(() => di.getDeleteMessageTemplateInteractor().invoke({ id: created.data.id }));
    expect(deleted.ok).toBe(true);
  });

  it("refuses unknown and malformed merge fields when a template is saved", async () => {
    const unknown = (await asAdmin(() =>
      di.getCreateMessageTemplateInteractor().invoke({
        name: `Bad ${randomUUID()}`,
        kind: "transactional",
        subject: "Hi",
        bodyMarkdown: "{{ contact.notes }}",
      }),
    )) as Outcome;
    const malformed = (await asAdmin(() =>
      di.getCreateMessageTemplateInteractor().invoke({
        name: `Bad ${randomUUID()}`,
        kind: "transactional",
        subject: "Hi {{ contact firstName }}",
        bodyMarkdown: "x",
      }),
    )) as Outcome;

    expect(codes(unknown)).toEqual([CustomErrorCode.mergeFieldUnknown]);
    expect(codes(malformed)).toEqual([CustomErrorCode.mergeFieldMalformed]);
  });

  it("previews against a real record, with the caller as the sender", async () => {
    const preview = await asAdmin(() =>
      di.getPreviewMessageTemplateInteractor().invoke({
        subject: "{{ deal.name }} for {{ contact.fullName }}",
        bodyMarkdown: "Regards, {{ sender.firstName }}",
        record: { entityType: EntityType.deal, entityId: dealId },
      }),
    );
    const missing = (await asAdmin(() =>
      di
        .getPreviewMessageTemplateInteractor()
        .invoke({ subject: "x", bodyMarkdown: "{{ organization.name }}", record: null }),
    )) as Outcome;

    expect(preview).toMatchObject({ ok: true, data: { subject: "Rollout for Anna Weber", text: "Regards, Max" } });
    expect(codes(missing)).toEqual([CustomErrorCode.mergePreviewNeedsRecord]);

    const senderOnly = await asAdmin(() =>
      di
        .getPreviewMessageTemplateInteractor()
        .invoke({ subject: "Hi", bodyMarkdown: "Regards, {{ sender.firstName }}", record: null }),
    );
    expect(senderOnly).toMatchObject({ ok: true, data: { text: "Regards, Max" } });
  });

  it("keeps templates read-only for a role without automation update rights", async () => {
    await expect(
      runAsBackgroundTenant(reader, () =>
        di
          .getCreateMessageTemplateInteractor()
          .invoke({ name: "Nope", kind: "transactional", subject: "x", bodyMarkdown: "y" }),
      ),
    ).rejects.toThrow();
  });
});
