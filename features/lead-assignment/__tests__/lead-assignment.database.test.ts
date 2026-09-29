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
const { LeadAssignmentStrategy } = await import("@/generated/prisma");
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const di = await import("@/core/di");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("lead assignment rules", { timeout: 120_000 }, () => {
  const companyId = randomUUID();
  const users: Record<string, string> = {};

  beforeAll(async () => {
    vi.spyOn(BackgroundTaskService.prototype, "dispatch").mockResolvedValue(undefined);
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      for (const [name, status] of [
        ["admin", "active"],
        ["ana", "active"],
        ["ben", "active"],
        ["cleo", "active"],
        ["gone", "inactive"],
      ] as const) {
        users[name] = (
          await prisma.user.create({
            data: {
              companyId,
              roleId: role.id,
              email: `${name}-${randomUUID()}@example.invalid`,
              firstName: name,
              lastName: "Tester",
              status,
            },
            select: { id: true },
          })
        ).id;
      }
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const as = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(users.admin, fn);
  const createLead = (data: Record<string, unknown>) =>
    as(() => di.getCreateLeadInteractor().invoke({ title: `Lead ${randomUUID().slice(0, 6)}`, ...data } as never));
  const ownerOf = (outcome: { ok: boolean; data?: { owner: { id: string } | null } }) =>
    outcome.ok ? (outcome.data?.owner?.id ?? null) : "failed";

  it("refuses a rule with an inactive user or a condition that is not a lead filter", async () => {
    const inactive = await as(() =>
      di.getCreateLeadAssignmentRuleInteractor().invoke({
        name: "Gone",
        strategy: LeadAssignmentStrategy.roundRobin,
        userIds: [users.ana, users.gone],
      }),
    );
    expect(inactive.ok).toBe(false);

    const badCondition = await as(() =>
      di.getCreateLeadAssignmentRuleInteractor().invoke({
        name: "Bad",
        strategy: LeadAssignmentStrategy.specificUser,
        userIds: [users.ana],
        conditions: [{ field: "not-a-field", operator: "in", value: ["x"] } as never],
      }),
    );
    expect(badCondition.ok).toBe(false);

    const twoUsers = await as(() =>
      di.getCreateLeadAssignmentRuleInteractor().invoke({
        name: "Two",
        strategy: LeadAssignmentStrategy.specificUser,
        userIds: [users.ana, users.ben],
      }),
    );
    expect(twoUsers.ok).toBe(false);
  });

  it("assigns by the first matching rule, round-robins the rest, and leaves an owned lead alone", async () => {
    await as(() =>
      di.getCreateLeadAssignmentRuleInteractor().invoke({
        name: "Qualified go to Ana",
        position: 0,
        strategy: LeadAssignmentStrategy.specificUser,
        userIds: [users.ana],
        conditions: [{ field: "leadStatus", operator: "in", value: ["qualified"] } as never],
      }),
    );
    await as(() =>
      di.getCreateLeadAssignmentRuleInteractor().invoke({
        name: "Everyone else",
        position: 1,
        strategy: LeadAssignmentStrategy.roundRobin,
        userIds: [users.ben, users.cleo],
      }),
    );

    expect(ownerOf(await createLead({ status: "qualified" }))).toBe(users.ana);
    const rotated = [];
    for (let index = 0; index < 3; index += 1) rotated.push(ownerOf(await createLead({})));
    expect(rotated).toEqual([users.ben, users.cleo, users.ben]);
    expect(ownerOf(await createLead({ ownerUserId: users.cleo }))).toBe(users.cleo);

    const many = await as(() =>
      di.getCreateManyLeadsInteractor().invoke({ leads: [{ title: "Bulk one" }, { title: "Bulk two" }] } as never),
    );
    expect(many.ok && many.data.map((lead) => lead.owner?.id)).toEqual([users.cleo, users.ben]);
  });

  it("assigns a lead a web form created, as the company", async () => {
    const lead = await runWithoutTenant(() =>
      prisma.lead.create({ data: { companyId, title: "From the web form", status: "new" }, select: { id: true } }),
    );
    const { assignWebFormLead } = await import("@/workflows/process-web-form-submission");

    await assignWebFormLead(lead.id, companyId);
    const assigned = await di.getProcessWebFormSubmissionRepo().findLeadForEventOrThrowUnscoped(lead.id);

    expect([users.ben, users.cleo]).toContain(assigned.owner?.id);
  });

  it("skips a disabled rule", async () => {
    const rules = await as(() => di.getGetLeadAssignmentRulesInteractor().invoke());
    if (!rules.ok) throw new Error("no rules");
    for (const rule of rules.data) {
      await as(() =>
        di.getUpdateLeadAssignmentRuleInteractor().invoke({
          id: rule.id,
          name: rule.name,
          position: rule.position,
          enabled: false,
          conditions: rule.conditions,
          strategy: rule.strategy,
          userIds: rule.userIds,
        }),
      );
    }

    expect(ownerOf(await createLead({}))).toBeNull();
  });
});
