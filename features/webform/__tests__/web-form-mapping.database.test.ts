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
const { getProcessWebFormSubmissionInteractor, getCreateWebFormSourceInteractor } = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("mapping a web form onto lead value and custom fields", () => {
  const companyId = randomUUID();
  const adminId = randomUUID();
  const sourceId = randomUUID();
  const column = { utm: randomUUID(), consent: randomUUID(), phone: randomUUID(), orgType: randomUUID() };

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      await prisma.user.create({
        data: {
          id: adminId,
          companyId,
          roleId: role.id,
          email: `admin-${adminId}@example.invalid`,
          firstName: "Form",
          lastName: "Admin",
          status: "active",
        },
      });
      await prisma.customColumn.createMany({
        data: [
          { id: column.utm, companyId, label: "UTM source", type: "plain", entityType: "lead", options: {} },
          {
            id: column.consent,
            companyId,
            label: "Marketing consent",
            type: "singleSelect",
            entityType: "lead",
            options: {
              options: [
                { value: "consent-yes", label: "Yes", color: "success", isDefault: false, index: 0 },
                { value: "consent-no", label: "No", color: "secondary", isDefault: false, index: 1 },
              ],
            },
          },
          { id: column.phone, companyId, label: "Phones", type: "phone", entityType: "contact", options: {} },
          { id: column.orgType, companyId, label: "Type", type: "plain", entityType: "organization", options: {} },
        ],
      });
      await prisma.webFormSource.create({
        data: {
          id: sourceId,
          companyId,
          name: "Market assessment",
          slug: `assessment-${randomUUID()}`,
          signingSecret: "secret",
          fieldMapping: {
            email: "fields.email",
            firstName: "fields.first_name",
            value: "fields.budget",
            titleTemplate: "{firstName} — {form_title}",
            customFields: [
              { columnId: column.utm, path: "tracking.utm_source" },
              { columnId: column.consent, path: "fields.consent" },
              { columnId: column.phone, path: "fields.phone" },
            ],
          },
        },
      });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  async function submitAndProcess(fields: Record<string, unknown>, tracking: Record<string, unknown> = {}) {
    const submission = await runWithoutTenant(() =>
      prisma.webFormSubmission.create({
        data: { companyId, sourceId, rawPayload: { form_title: "Market assessment", fields, tracking } },
        select: { id: true },
      }),
    );
    const outcome = await getProcessWebFormSubmissionInteractor().invoke({ submissionId: submission.id });
    expect(outcome.ok).toBe(true);

    return outcome.ok ? outcome.data.leadId : null;
  }

  const leadValues = (leadId: string) =>
    runWithoutTenant(() =>
      prisma.customFieldValue.findMany({ where: { leadId }, select: { columnId: true, value: true } }),
    );

  it("writes the value, the lead's extra fields and the contact's phone, and renders a single-brace title", async () => {
    const leadId = await submitAndProcess(
      { email: "ada@buyer.example", first_name: "Ada", budget: "€ 42,000", consent: "yes", phone: "+49 30 1234567" },
      { utm_source: "linkedin" },
    );

    const lead = await runWithoutTenant(() =>
      prisma.lead.findUnique({ where: { id: leadId ?? "" }, select: { title: true, value: true, contactId: true } }),
    );
    expect(lead).toMatchObject({ title: "Ada — Market assessment", value: 42_000 });
    expect(await leadValues(leadId ?? "")).toEqual(
      expect.arrayContaining([
        { columnId: column.utm, value: "linkedin" },
        { columnId: column.consent, value: "consent-yes" },
      ]),
    );
    const phone = await runWithoutTenant(() =>
      prisma.customFieldValue.findMany({
        where: { contactId: lead?.contactId ?? "", columnId: column.phone },
        select: { value: true },
      }),
    );
    expect(phone).toEqual([{ value: "+49301234567" }]);
  });

  it("keeps the phone a returning contact already has, and skips values their field refuses", async () => {
    const leadId = await submitAndProcess({
      email: "ada@buyer.example",
      first_name: "Ada",
      budget: "not sure",
      consent: "maybe",
      phone: "+44 20 7946 0000",
    });

    const lead = await runWithoutTenant(() =>
      prisma.lead.findUnique({ where: { id: leadId ?? "" }, select: { value: true, contactId: true } }),
    );
    expect(lead?.value).toBeNull();
    expect(await leadValues(leadId ?? "")).toEqual([]);
    const phones = await runWithoutTenant(() =>
      prisma.customFieldValue.findMany({
        where: { contactId: lead?.contactId ?? "", columnId: column.phone },
        select: { value: true },
      }),
    );
    expect(phones).toEqual([{ value: "+49301234567" }]);
  });

  it("refuses a source that maps a field onto a column other than a lead or contact one", async () => {
    const created = await runAsBackgroundTenant(adminId, () =>
      getCreateWebFormSourceInteractor().invoke({
        name: "Bad mapping",
        slug: `bad-${randomUUID()}`,
        fieldMapping: {
          customFields: [
            { columnId: column.utm, path: "fields.ok" },
            { columnId: column.orgType, path: "fields.company_type" },
          ],
        },
      } as never),
    );

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(serializeInteractorFailure(created.error).issues).toEqual([
      expect.objectContaining({
        path: ["fieldMapping", "customFields", 1, "columnId"],
        customCode: CustomErrorCode.customColumnIdNotFound,
      }),
    ]);
  });
});
