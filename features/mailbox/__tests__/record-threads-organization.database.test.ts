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
const { Action, Resource } = await import("@/generated/prisma");
const { getGetRecordThreadsInteractor } = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

type ThreadSpec = {
  key: string;
  participants: { identifier: string; isSelf?: boolean }[];
  shared?: boolean;
  linkedToDeal?: boolean;
  otherCompany?: boolean;
};

describeDatabase("conversations shown on an organization and a lead", () => {
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const viewerId = randomUUID();
  const otherTenantUserId = randomUUID();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const annaId = randomUUID();
  const bobId = randomUUID();
  const carolId = randomUUID();
  const dealId = randomUUID();
  const leadId = randomUUID();
  const threadIds = new Map<string, string>();

  const threads: ThreadSpec[] = [
    { key: "anna", participants: [{ identifier: "anna@buyer.example" }] },
    { key: "colleague", participants: [{ identifier: "Colleague@Buyer.Example" }] },
    { key: "stranger-on-gmail", participants: [{ identifier: "stranger@gmail.com" }] },
    { key: "bob-on-gmail", participants: [{ identifier: "bob@gmail.com" }] },
    { key: "other-organization", participants: [{ identifier: "carol@other.example" }] },
    { key: "not-shared", participants: [{ identifier: "anna@buyer.example" }], shared: false },
    { key: "linked-deal", participants: [{ identifier: "z@elsewhere.example" }], linkedToDeal: true },
    { key: "own-mailbox-on-domain", participants: [{ identifier: "me@buyer.example", isSelf: true }] },
    { key: "other-tenant", participants: [{ identifier: "anna@buyer.example" }], otherCompany: true },
  ];

  const idsOf = (...keys: string[]) => keys.map((key) => threadIds.get(key));

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.createMany({ data: [{ id: companyId }, { id: otherCompanyId }] });
      const role = await prisma.userRole.create({
        data: {
          companyId,
          name: `Everything ${randomUUID()}`,
          permissions: {
            create: [
              Resource.inboxMessages,
              Resource.contacts,
              Resource.organizations,
              Resource.deals,
              Resource.leads,
            ].map((resource) => ({ companyId, resource, action: Action.readAll })),
          },
        },
        select: { id: true },
      });
      await prisma.user.create({
        data: {
          id: viewerId,
          companyId,
          roleId: role.id,
          firstName: "Viewer",
          lastName: "Tester",
          email: `viewer-${viewerId}@example.invalid`,
          status: "active",
        },
      });
      await prisma.user.create({
        data: {
          id: otherTenantUserId,
          companyId: otherCompanyId,
          firstName: "Other",
          lastName: "Tenant",
          email: `other-${otherTenantUserId}@example.invalid`,
          status: "active",
        },
      });
      await prisma.organization.createMany({
        data: [
          { id: organizationId, companyId, name: "Buyer GmbH" },
          { id: otherOrganizationId, companyId, name: "Other AG" },
        ],
      });
      await prisma.contact.createMany({
        data: [
          { id: annaId, companyId, firstName: "Anna", lastName: "Buyer" },
          { id: bobId, companyId, firstName: "Bob", lastName: "Buyer" },
          { id: carolId, companyId, firstName: "Carol", lastName: "Other" },
        ],
      });
      await prisma.contactOrganization.createMany({
        data: [
          { companyId, contactId: annaId, organizationId },
          { companyId, contactId: bobId, organizationId },
          { companyId, contactId: carolId, organizationId: otherOrganizationId },
        ],
      });
      await prisma.contactIdentifier.createMany({
        data: [
          [annaId, "anna@buyer.example"],
          [bobId, "bob@gmail.com"],
          [carolId, "carol@other.example"],
        ].map(([contactId, value]) => ({
          companyId,
          contactId,
          provider: "mail" as const,
          channelClass: "email",
          value,
        })),
      });
      await prisma.deal.create({ data: { id: dealId, companyId, name: "Buyer rollout" } });
      await prisma.dealOrganization.create({ data: { companyId, dealId, organizationId } });
      await prisma.lead.create({ data: { id: leadId, companyId, title: "Anna's enquiry", contactId: annaId } });

      const accountFor = async (company: string) =>
        (
          await prisma.connectedAccount.create({
            data: {
              companyId: company,
              userId: company === companyId ? viewerId : otherTenantUserId,
              unipileAccountId: `imap:${randomUUID()}`,
              provider: "mail",
              status: "ok",
              hasMessaging: true,
              emailAddress: "me@buyer.example",
            },
            select: { id: true },
          })
        ).id;
      const accounts = { [companyId]: await accountFor(companyId), [otherCompanyId]: await accountFor(otherCompanyId) };

      for (const [index, spec] of threads.entries()) {
        const company = spec.otherCompany ? otherCompanyId : companyId;
        const id = randomUUID();
        threadIds.set(spec.key, id);
        await prisma.messagingThread.create({
          data: {
            id,
            companyId: company,
            connectedAccountId: accounts[company],
            unipileThreadId: `thread-${id}`,
            provider: "mail",
            subject: spec.key,
            lastMessageAt: new Date(Date.UTC(2026, 8, 1 + index)),
            sharedToCrm: spec.shared ?? true,
            linkedDealId: spec.linkedToDeal ? dealId : null,
            participants: {
              create: spec.participants.map((participant) => ({
                companyId: company,
                provider: "mail" as const,
                providerUserId: participant.identifier,
                identifier: participant.identifier,
                isSelf: participant.isSelf ?? false,
              })),
            },
          },
        });
      }
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } }));
    await prisma.$disconnect();
  });

  const threadsFor = async (input: { organizationId?: string; leadId?: string; contactId?: string }) => {
    const result = await runAsBackgroundTenant(viewerId, () => getGetRecordThreadsInteractor().invoke(input));
    expect(result.ok).toBe(true);

    return result.ok ? result.data.map((thread) => thread.id) : [];
  };

  it("shows an organization its people's threads, its deals' threads and colleagues on its own domain, newest first", async () => {
    expect(await threadsFor({ organizationId })).toEqual(idsOf("linked-deal", "bob-on-gmail", "colleague", "anna"));
  });

  it("keeps free-mail strangers, other organizations, unshared threads, the own mailbox and other tenants out", async () => {
    const shown = new Set(await threadsFor({ organizationId }));

    for (const key of [
      "stranger-on-gmail",
      "other-organization",
      "not-shared",
      "own-mailbox-on-domain",
      "other-tenant",
    ])
      expect(shown.has(threadIds.get(key) ?? ""), key).toBe(false);
  });

  it("shows a lead the threads of its contact only", async () => {
    expect(await threadsFor({ leadId })).toEqual(idsOf("anna"));
  });

  it("leaves a contact's own view unchanged by the organization's domain", async () => {
    expect(await threadsFor({ contactId: annaId })).toEqual(idsOf("anna"));
  });
});
