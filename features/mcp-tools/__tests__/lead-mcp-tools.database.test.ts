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
const { BackgroundTaskService } = await import("@/core/utils/background-task.service");
const { ALL_MCP_TOOLS, MCP_SERVER_TOOL_GROUPS } = await import("@/features/mcp-tools/tool-registry");
const { convertLeadToDealTool, createLeadsTool, listLeadsTool, updateLeadsTool } = await import(
  "@/features/mcp-tools/lead.mcp-tools"
);

const structured = (result: unknown) => (result as { structuredContent?: unknown }).structuredContent;

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("lead MCP tools", { timeout: 120_000 }, () => {
  const companyId = randomUUID();
  let userId: string;

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
            email: `mcp-${randomUUID()}@example.invalid`,
            firstName: "Mia",
            lastName: "Agent",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
      const pipeline = await prisma.pipeline.create({
        data: { companyId, name: "Sales", position: 0, isDefault: true },
        select: { id: true },
      });
      await prisma.pipelineStage.create({
        data: { companyId, pipelineId: pipeline.id, name: "Qualified", position: 0, kind: "open" },
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const as = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(userId, fn);

  it("is served on the MCP endpoint but kept out of the in-app agent's catalog", () => {
    const serverNames = Object.values(MCP_SERVER_TOOL_GROUPS)
      .flat()
      .map((tool) => tool.name);
    const agentNames = ALL_MCP_TOOLS.map((tool) => tool.name);

    expect(serverNames).toEqual(
      expect.arrayContaining(["list_leads", "create_leads", "update_leads", "convert_lead_to_deal"]),
    );
    expect(agentNames).not.toContain("create_leads");
  });

  it("creates, lists, updates and converts leads", async () => {
    const created = await as(() =>
      createLeadsTool.execute({ leads: [{ title: "Agent lead", value: 1200, ownerUserId: userId } as never] }),
    );
    const leadId = (structured(created) as { items: Array<{ id: string }> }).items[0].id;

    const listed = await as(() => listLeadsTool.execute({ search: "Agent" }));
    expect((structured(listed) as { items: Array<{ id: string; owner: string }> }).items).toEqual([
      expect.objectContaining({ id: leadId, owner: "Mia Agent", value: 1200, status: "new" }),
    ]);

    const updated = await as(() => updateLeadsTool.execute({ leads: [{ id: leadId, status: "qualified" } as never] }));
    expect(structured(updated)).toEqual({ updated: 1 });
    const qualified = await as(() => listLeadsTool.execute({ status: ["qualified"] }));
    expect((structured(qualified) as { items: unknown[] }).items).toHaveLength(1);

    const converted = await as(() => convertLeadToDealTool.execute({ id: leadId }));
    const dealId = (structured(converted) as { dealId: string }).dealId;
    const lead = await runWithoutTenant(() =>
      prisma.lead.findUnique({ where: { id: leadId }, select: { convertedDealId: true } }),
    );
    expect(lead?.convertedDealId).toBe(dealId);
  });
});
