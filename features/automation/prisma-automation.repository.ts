import type { RepoArgs } from "@/core/utils/types";
import type { AdmittedAutomationRun, TriggerAutomationsRepo, TriggerableAutomation } from "./trigger-automations.repo";
import type { AutomationRunPlan, ExecuteAutomationRunRepo } from "./run/execute-automation-run.repo";
import type { UpsertAutomationData, UpsertAutomationRepo } from "./upsert/upsert-automation.interactor";
import type { DeleteAutomationRepo } from "./delete/delete-automation.interactor";
import type { GetAutomationsRepo } from "./get/get-automations.interactor";
import type { AutomationDto } from "./automation.schema";
import type { Filter } from "@/core/base/base-get.schema";

import type { EntityType, Prisma } from "@/generated/prisma";
import { AutomationRunStatus, AutomationTriggerKind, Status } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const automationSelect = {
  id: true,
  name: true,
  description: true,
  enabled: true,
  entityType: true,
  triggerKind: true,
  changedFields: true,
  conditions: true,
  schedule: true,
  scheduleTimeZone: true,
  nextRunAt: true,
  lastRunAt: true,
  createdAt: true,
  updatedAt: true,
  steps: { select: { id: true, position: true, kind: true, config: true }, orderBy: { position: "asc" } },
} satisfies Prisma.AutomationSelect;

type AutomationRow = Prisma.AutomationGetPayload<{ select: typeof automationSelect }>;

function toConditions(value: Prisma.JsonValue | null): Filter[] | null {
  return Array.isArray(value) ? (value as unknown as Filter[]) : null;
}

export class PrismaAutomationRepo
  extends BaseRepository<Prisma.AutomationWhereInput>
  implements
    TriggerAutomationsRepo,
    ExecuteAutomationRunRepo,
    UpsertAutomationRepo,
    DeleteAutomationRepo,
    GetAutomationsRepo
{
  private toDto(row: AutomationRow): AutomationDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      entityType: row.entityType,
      triggerKind: row.triggerKind,
      changedFields: row.changedFields,
      conditions: toConditions(row.conditions),
      schedule: row.schedule,
      scheduleTimeZone: row.scheduleTimeZone,
      nextRunAt: row.nextRunAt,
      lastRunAt: row.lastRunAt,
      steps: row.steps.map((step) => ({
        id: step.id,
        position: step.position,
        kind: step.kind,
        config: step.config,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getAutomationById(id: string): Promise<AutomationDto | null> {
    const row = await this.prisma.automation.findFirst({
      where: { id, ...this.accessWhere("automation") },
      select: automationSelect,
    });

    return row ? this.toDto(row) : null;
  }

  async getAutomationByIdOrThrow(id: string): Promise<AutomationDto> {
    const row = await this.prisma.automation.findFirstOrThrow({
      where: { id, ...this.accessWhere("automation") },
      select: automationSelect,
    });

    return this.toDto(row);
  }

  async listAutomations(): Promise<AutomationDto[]> {
    const rows = await this.prisma.automation.findMany({
      where: this.accessWhere("automation"),
      select: automationSelect,
      orderBy: [{ createdAt: "desc" }],
    });

    return rows.map((row) => this.toDto(row));
  }

  @Transaction
  async upsertAutomationOrThrow(args: UpsertAutomationData, createdByUserId: string): Promise<AutomationDto> {
    const { companyId } = this.user;
    const { id, steps, conditions, ...rest } = args;

    const shared = {
      ...rest,
      ...(conditions === undefined ? {} : { conditions: conditions as unknown as Prisma.InputJsonValue }),
    };

    let automationId = id;

    if (automationId) {
      await this.prisma.automation.updateMany({
        where: { id: automationId, ...this.accessWhere("automation") },
        data: shared,
      });
    } else {
      const created = await this.prisma.automation.create({
        data: {
          ...shared,
          name: rest.name ?? "",
          triggerKind: rest.triggerKind ?? AutomationTriggerKind.recordCreated,
          companyId,
          createdByUserId,
        },
        select: { id: true },
      });

      automationId = created.id;
    }

    if (steps) {
      await this.prisma.automationStep.deleteMany({ where: { automationId, companyId } });
      await this.prisma.automationStep.createMany({
        data: steps.map((step, position) => ({
          companyId,
          automationId,
          position,
          kind: step.kind,
          config: step.config as unknown as Prisma.InputJsonValue,
        })),
      });
    }

    return await this.getAutomationByIdOrThrow(automationId);
  }

  @Transaction
  async deleteAutomationOrThrow(id: string): Promise<AutomationDto> {
    const automation = await this.getAutomationByIdOrThrow(id);
    await this.prisma.automation.deleteMany({ where: { id, ...this.accessWhere("automation") } });

    return automation;
  }

  @BypassTenantGuard
  async findEventAutomationsUnscoped(
    companyId: string,
    entityType: EntityType,
    triggerKind: AutomationTriggerKind,
  ): Promise<TriggerableAutomation[]> {
    const rows = await this.prisma.automation.findMany({
      where: { companyId, enabled: true, entityType, triggerKind },
      select: { id: true, changedFields: true, conditions: true },
    });

    return rows.map((row) => ({
      id: row.id,
      changedFields: row.changedFields,
      conditions: toConditions(row.conditions),
    }));
  }

  @BypassTenantGuard
  @Transaction
  async admitAutomationRunsUnscoped(
    args: RepoArgs<TriggerAutomationsRepo, "admitAutomationRunsUnscoped">,
  ): Promise<AdmittedAutomationRun[]> {
    const runs: AdmittedAutomationRun[] = [];

    for (const automationId of args.automationIds) {
      const steps = await this.prisma.automationStep.findMany({
        where: { automationId, companyId: args.companyId },
        select: { id: true, position: true },
        orderBy: { position: "asc" },
      });
      if (steps.length === 0) continue;

      const run = await this.prisma.automationRun.create({
        data: {
          companyId: args.companyId,
          automationId,
          status: AutomationRunStatus.queued,
          entityType: args.entityType,
          entityId: args.entityId,
          triggerEvent: args.triggerEvent,
          triggerPayload: args.triggerPayload as Prisma.InputJsonValue,
          steps: {
            create: steps.map((step) => ({
              companyId: args.companyId,
              stepId: step.id,
              position: step.position,
              status: AutomationRunStatus.queued,
            })),
          },
        },
        select: { id: true },
      });

      runs.push({ id: run.id, automationId });
    }

    return runs;
  }

  @BypassTenantGuard
  async findRunPlanUnscoped(runId: string): Promise<AutomationRunPlan | null> {
    const run = await this.prisma.automationRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        companyId: true,
        automationId: true,
        entityType: true,
        entityId: true,
        triggerEvent: true,
        automation: { select: { name: true } },
        steps: {
          select: { id: true, position: true, stepId: true, step: { select: { kind: true, config: true } } },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!run) return null;

    return {
      runId: run.id,
      automationId: run.automationId,
      automationName: run.automation.name,
      companyId: run.companyId,
      entityType: run.entityType,
      entityId: run.entityId,
      triggerEvent: run.triggerEvent,
      steps: run.steps.flatMap((step) =>
        step.step && step.stepId
          ? [
              {
                id: step.id,
                stepId: step.stepId,
                position: step.position,
                kind: step.step.kind,
                config: step.step.config,
              },
            ]
          : [],
      ),
    };
  }

  @BypassTenantGuard
  async claimRunUnscoped(runId: string): Promise<boolean> {
    const { count } = await this.prisma.automationRun.updateMany({
      where: { id: runId, status: AutomationRunStatus.queued },
      data: { status: AutomationRunStatus.running, startedAt: new Date() },
    });

    return count === 1;
  }

  @BypassTenantGuard
  async markRunStepUnscoped(args: RepoArgs<ExecuteAutomationRunRepo, "markRunStepUnscoped">): Promise<void> {
    const { runStepId, output, ...rest } = args;

    await this.prisma.automationRunStep.updateMany({
      where: { id: runStepId },
      data: { ...rest, ...(output === undefined ? {} : { output: output as Prisma.InputJsonValue }) },
    });
  }

  @BypassTenantGuard
  @Transaction
  async settleRunUnscoped(args: RepoArgs<ExecuteAutomationRunRepo, "settleRunUnscoped">): Promise<void> {
    const run = await this.prisma.automationRun.findUnique({
      where: { id: args.runId },
      select: { automationId: true, companyId: true },
    });
    if (!run) return;

    await this.prisma.automationRun.updateMany({
      where: { id: args.runId, companyId: run.companyId },
      data: { status: args.status, error: args.error, finishedAt: new Date() },
    });

    await this.prisma.automation.updateMany({
      where: { id: run.automationId, companyId: run.companyId },
      data: { lastRunAt: new Date() },
    });
  }

  @BypassTenantGuard
  async findAutomationOwnerUserIdUnscoped(companyId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        companyId,
        status: Status.active,
        role: { OR: [{ isSystemRole: true }, { permissions: { some: { resource: "automations" } } }] },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    return user?.id ?? null;
  }
}
