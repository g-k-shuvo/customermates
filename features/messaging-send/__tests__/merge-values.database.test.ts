import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

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
const { EntityType } = await import("@/generated/prisma");
const { PrismaMergeValuesRepo } = await import("../render/prisma-merge-values.repository");
const { mergeValuesFrom } = await import("../render/merge-fields");
const { renderEmailMarkdown } = await import("../render/render-email-markdown");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("merge values from the triggering record", () => {
  const companyId = randomUUID();
  let userId: string;
  let dealId: string;
  let leadId: string;
  let contactId: string;

  beforeAll(async () => {
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
            email: `max-${randomUUID()}@vendor.example`,
            firstName: "Max",
            lastName: "Bergmann",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
      const organization = await prisma.organization.create({ data: { companyId, name: "Acme GmbH" } });
      contactId = (
        await prisma.contact.create({
          data: {
            companyId,
            firstName: "Anna",
            lastName: "Weber",
            organizations: { create: { companyId, organizationId: organization.id } },
            identifiers: {
              create: {
                companyId,
                provider: "mail",
                channelClass: "email",
                value: `anna-${randomUUID()}@acme.example`,
              },
            },
          },
          select: { id: true },
        })
      ).id;
      dealId = (
        await prisma.deal.create({
          data: { companyId, name: "Rollout", contacts: { create: { companyId, contactId } } },
          select: { id: true },
        })
      ).id;
      leadId = (await prisma.lead.create({ data: { companyId, title: "Inbound", contactId }, select: { id: true } }))
        .id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const load = (entityType: (typeof EntityType)[keyof typeof EntityType] | null, entityId: string) =>
    runAsBackgroundTenant(userId, () =>
      new PrismaMergeValuesRepo().loadMergeSource(entityType ? { entityType, entityId } : null, userId),
    );

  it("fills contact, organization, deal and sender fields from a deal", async () => {
    const values = mergeValuesFrom(await load(EntityType.deal, dealId));

    expect(values).toMatchObject({
      "contact.fullName": "Anna Weber",
      "organization.name": "Acme GmbH",
      "deal.name": "Rollout",
      "sender.fullName": "Max Bergmann",
    });
    expect(values["contact.email"]).toMatch(/^anna-.*@acme\.example$/);
  });

  it("reaches the contact behind a lead and a contact directly", async () => {
    expect(mergeValuesFrom(await load(EntityType.lead, leadId))).toMatchObject({
      "contact.firstName": "Anna",
      "organization.name": "Acme GmbH",
      "deal.name": null,
    });
    expect(mergeValuesFrom(await load(EntityType.contact, contactId))).toMatchObject({ "contact.lastName": "Weber" });
  });

  it("renders a template against a real record and refuses what the record cannot fill", async () => {
    const values = mergeValuesFrom(await load(EntityType.lead, leadId));

    const filled = renderEmailMarkdown({
      subject: "Hi {{contact.firstName}}",
      markdown: 'About {{deal.name | "your request"}}',
      values,
    });
    const refused = renderEmailMarkdown({ subject: "x", markdown: "About {{deal.name}}", values });

    expect(filled.ok && filled.email.text).toBe("About your request");
    expect(refused).toEqual({ ok: false, failure: { code: "missingMergeValue", field: "deal.name" } });
  });
});
