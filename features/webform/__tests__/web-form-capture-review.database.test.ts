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
const { getProcessWebFormSubmissionInteractor } = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("web form capture: fuzzy matches go to review, repeat submissions can join the open lead", () => {
  const companyId = randomUUID();
  const sourceId = randomUUID();
  let existingAda: string;
  let organization: string;

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      await prisma.user.create({
        data: {
          companyId,
          roleId: role.id,
          email: `admin-${randomUUID()}@example.invalid`,
          firstName: "Form",
          lastName: "Admin",
          status: "active",
        },
      });
      organization = (await prisma.organization.create({ data: { companyId, name: "Analytical Engines" } })).id;
      existingAda = (
        await prisma.contact.create({
          data: {
            companyId,
            firstName: "Ada",
            lastName: "Lovelace",
            identifiers: {
              create: { companyId, provider: "mail", channelClass: "email", value: "ada@engines.example" },
            },
          },
          select: { id: true },
        })
      ).id;
      await prisma.webFormSource.create({
        data: {
          id: sourceId,
          companyId,
          name: "Whitepaper",
          slug: `whitepaper-${randomUUID()}`,
          signingSecret: "secret",
          dedupeLeads: true,
          fieldMapping: {
            email: "fields.email",
            firstName: "fields.first_name",
            lastName: "fields.last_name",
            organizationName: "fields.company",
            message: "fields.message",
            titleTemplate: "{{firstName}} — whitepaper",
          },
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  async function submit(fields: Record<string, unknown>) {
    const submission = await runWithoutTenant(() =>
      prisma.webFormSubmission.create({ data: { companyId, sourceId, rawPayload: { fields } }, select: { id: true } }),
    );
    const outcome = await getProcessWebFormSubmissionInteractor().invoke({ submissionId: submission.id });
    if (!outcome.ok) throw new Error("processing failed");

    return outcome.data;
  }

  it("creates a new contact for a new address but opens a review group with the look-alike, never merging", async () => {
    const outcome = await submit({
      email: "a.lovelace@engines.example",
      first_name: "Ada",
      last_name: "Lovelace",
      company: "analytical engines",
      message: "Please send the whitepaper",
    });

    const lead = await runWithoutTenant(() =>
      prisma.lead.findUniqueOrThrow({
        where: { id: outcome.leadId ?? "" },
        select: { contactId: true, organizationId: true },
      }),
    );
    expect(lead.contactId).not.toBe(existingAda);
    expect(lead.organizationId).toBe(organization);

    const groups = await runWithoutTenant(() =>
      prisma.duplicateGroup.findMany({
        where: { companyId, status: "open" },
        select: { members: { select: { contactId: true } } },
      }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((member) => member.contactId).sort()).toEqual([existingAda, lead.contactId].sort());
    expect(await runWithoutTenant(() => prisma.contact.count({ where: { companyId } }))).toBe(2);
  });

  it("appends a repeat submission to the contact's open lead when the source asks for it", async () => {
    const first = await submit({
      email: "ada@engines.example",
      first_name: "Ada",
      last_name: "Lovelace",
      message: "First",
    });
    const second = await submit({
      email: "ada@engines.example",
      first_name: "Ada",
      last_name: "Lovelace",
      message: "Second",
    });

    expect(first.appended).toBe(false);
    expect(second).toMatchObject({ appended: true, leadId: first.leadId });

    const notes = await runWithoutTenant(() =>
      prisma.lead.findUniqueOrThrow({ where: { id: first.leadId ?? "" }, select: { notes: true } }),
    );
    expect(JSON.stringify(notes.notes)).toContain("First");
    expect(JSON.stringify(notes.notes)).toContain("Second");
    expect(await runWithoutTenant(() => prisma.lead.count({ where: { companyId, contactId: existingAda } }))).toBe(1);
  });
});
