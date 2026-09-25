import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "vitest-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
    EMAIL_TRANSPORT: "smtp",
  },
}));

const { PrismaAutomationRepo } = await import("@/features/automation/prisma-automation.repository");
const { PrismaAutomationConditionMatcher } = await import("@/features/automation/prisma-automation-condition-matcher");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");
const { createMockUser } = await import("@/tests/helpers/mock-user");
const { AutomationActionKind, AutomationTriggerKind, EntityType } = await import("@/generated/prisma");
const { automationTriggerForEvent } = await import("@/features/automation/automation-trigger-map");
const { DomainEvent } = await import("@/features/event/domain-events");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

const TRIGGER_KINDS = [
  AutomationTriggerKind.recordCreated,
  AutomationTriggerKind.recordUpdated,
  AutomationTriggerKind.recordDeleted,
] as const;

const RECORD_TYPES = [
  EntityType.contact,
  EntityType.organization,
  EntityType.deal,
  EntityType.lead,
  EntityType.task,
] as const;

const EVENT_BY_PAIR: Record<string, string> = {
  [`${EntityType.contact}:${AutomationTriggerKind.recordCreated}`]: DomainEvent.CONTACT_CREATED,
  [`${EntityType.contact}:${AutomationTriggerKind.recordUpdated}`]: DomainEvent.CONTACT_UPDATED,
  [`${EntityType.contact}:${AutomationTriggerKind.recordDeleted}`]: DomainEvent.CONTACT_DELETED,
  [`${EntityType.organization}:${AutomationTriggerKind.recordCreated}`]: DomainEvent.ORGANIZATION_CREATED,
  [`${EntityType.organization}:${AutomationTriggerKind.recordUpdated}`]: DomainEvent.ORGANIZATION_UPDATED,
  [`${EntityType.organization}:${AutomationTriggerKind.recordDeleted}`]: DomainEvent.ORGANIZATION_DELETED,
  [`${EntityType.deal}:${AutomationTriggerKind.recordCreated}`]: DomainEvent.DEAL_CREATED,
  [`${EntityType.deal}:${AutomationTriggerKind.recordUpdated}`]: DomainEvent.DEAL_UPDATED,
  [`${EntityType.deal}:${AutomationTriggerKind.recordDeleted}`]: DomainEvent.DEAL_DELETED,
  [`${EntityType.lead}:${AutomationTriggerKind.recordCreated}`]: DomainEvent.LEAD_CREATED,
  [`${EntityType.lead}:${AutomationTriggerKind.recordUpdated}`]: DomainEvent.LEAD_UPDATED,
  [`${EntityType.lead}:${AutomationTriggerKind.recordDeleted}`]: DomainEvent.LEAD_DELETED,
  [`${EntityType.task}:${AutomationTriggerKind.recordCreated}`]: DomainEvent.TASK_CREATED,
  [`${EntityType.task}:${AutomationTriggerKind.recordUpdated}`]: DomainEvent.TASK_UPDATED,
  [`${EntityType.task}:${AutomationTriggerKind.recordDeleted}`]: DomainEvent.TASK_DELETED,
};

async function makeCompany() {
  return runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companyIds.push(company.id);

    return company.id;
  });
}

async function makeAutomation(args: {
  companyId: string;
  entityType: (typeof RECORD_TYPES)[number];
  triggerKind: (typeof TRIGGER_KINDS)[number];
  changedFields?: string[];
}) {
  return runWithoutTenant(async () => {
    const automation = await prisma.automation.create({
      data: {
        companyId: args.companyId,
        name: `${args.entityType} ${args.triggerKind}`,
        enabled: true,
        entityType: args.entityType,
        triggerKind: args.triggerKind,
        changedFields: args.changedFields ?? [],
      },
      select: { id: true },
    });

    await prisma.automationStep.create({
      data: {
        companyId: args.companyId,
        automationId: automation.id,
        position: 0,
        kind: AutomationActionKind.createNote,
        config: { body: "touched" },
      },
    });

    return automation.id;
  });
}

describeDatabase("every record trigger a matrix of automations can watch", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      for (const companyId of companyIds) await prisma.company.delete({ where: { id: companyId } });
    });
    await prisma.$disconnect();
  });

  it.each(RECORD_TYPES.flatMap((entityType) => TRIGGER_KINDS.map((triggerKind) => ({ entityType, triggerKind }))))(
    "resolves and admits a run for $entityType $triggerKind",
    async ({ entityType, triggerKind }) => {
      const event = EVENT_BY_PAIR[`${entityType}:${triggerKind}`];
      expect(event, `${entityType}/${triggerKind} has no event`).toBeDefined();

      const trigger = automationTriggerForEvent(event);
      expect(trigger, `${event} resolves no trigger`).toEqual({ entityType, triggerKind });

      const companyId = await makeCompany();
      const automationId = await makeAutomation({ companyId, entityType, triggerKind });

      const repo = new PrismaAutomationRepo();
      const subscribed = await repo.findEventAutomationsUnscoped(companyId, entityType, triggerKind);
      expect(subscribed.map(({ id }) => id)).toEqual([automationId]);

      const admitted = await repo.admitAutomationRunsUnscoped({
        companyId,
        automationIds: [automationId],
        entityType,
        entityId: null,
        triggerEvent: event,
        triggerPayload: { entityId: null },
      });

      expect(admitted).toHaveLength(1);

      const steps = await runWithoutTenant(() =>
        prisma.automationRunStep.findMany({ where: { runId: admitted[0]?.id } }),
      );
      expect(steps).toHaveLength(1);
    },
  );

  it("does not admit a run for an automation watching another record type", async () => {
    const companyId = await makeCompany();
    await makeAutomation({
      companyId,
      entityType: EntityType.deal,
      triggerKind: AutomationTriggerKind.recordCreated,
    });

    const repo = new PrismaAutomationRepo();
    const subscribed = await repo.findEventAutomationsUnscoped(
      companyId,
      EntityType.contact,
      AutomationTriggerKind.recordCreated,
    );

    expect(subscribed).toEqual([]);
  });

  it("does not admit a run for a disabled automation", async () => {
    const companyId = await makeCompany();
    const automationId = await makeAutomation({
      companyId,
      entityType: EntityType.deal,
      triggerKind: AutomationTriggerKind.recordCreated,
    });
    await runWithoutTenant(() => prisma.automation.update({ where: { id: automationId }, data: { enabled: false } }));

    const repo = new PrismaAutomationRepo();
    const subscribed = await repo.findEventAutomationsUnscoped(
      companyId,
      EntityType.deal,
      AutomationTriggerKind.recordCreated,
    );

    expect(subscribed).toEqual([]);
  });

  it("keeps one company's automations out of another company's events", async () => {
    const [mine, theirs] = [await makeCompany(), await makeCompany()];
    await makeAutomation({
      companyId: mine,
      entityType: EntityType.deal,
      triggerKind: AutomationTriggerKind.recordCreated,
    });

    const repo = new PrismaAutomationRepo();
    const subscribed = await repo.findEventAutomationsUnscoped(
      theirs,
      EntityType.deal,
      AutomationTriggerKind.recordCreated,
    );

    expect(subscribed).toEqual([]);
  });

  it.each([
    { name: "Matching deal", condition: "Matching", expected: true },
    { name: "Other deal", condition: "Matching", expected: false },
  ])("answers $expected for $name against a name condition", async ({ name, condition, expected }) => {
    const companyId = await makeCompany();
    const deal = await runWithoutTenant(() => prisma.deal.create({ data: { companyId, name }, select: { id: true } }));
    const user = createMockUser({ companyId });

    const matcher = new PrismaAutomationConditionMatcher();
    const matches = await runWithTenant(user, () =>
      matcher.matchesInTenant({
        companyId,
        entityType: EntityType.deal,
        entityId: deal.id,
        conditions: [{ field: "name", operator: "contains", value: condition } as never],
      }),
    );

    expect(matches).toBe(expected);
  });
});
