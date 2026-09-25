import type {
  AutomationActionContext,
  AutomationActionExecutor,
  AutomationActionOutcome,
} from "./automation-action-executor";
import type { CreateTaskInteractor } from "@/features/tasks/upsert/create-task.interactor";
import type { CreateDealInteractor } from "@/features/deals/upsert/create-deal.interactor";
import type { CreateLeadInteractor } from "@/features/leads/upsert/create-lead.interactor";
import type { UpdateDealInteractor } from "@/features/deals/upsert/update-deal.interactor";
import type { AutomationRecordWriter } from "./automation-record-writer";
import type { AutomationEmailSender } from "./automation-email-sender";

import { AutomationActionKind, AutomationTriggerKind, EntityType, LeadStatus } from "@/generated/prisma";

import { automationTriggerForEvent } from "../automation-trigger-map";

import {
  AddLabelConfigSchema,
  AssignOwnerConfigSchema,
  CallWebhookConfigSchema,
  CreateDealConfigSchema,
  CreateLeadConfigSchema,
  CreateNoteConfigSchema,
  CreateTaskConfigSchema,
  MoveStageConfigSchema,
  SendEmailConfigSchema,
  UpdateFieldConfigSchema,
} from "../automation-action.schema";
import { isInteractorFailure } from "@/core/validation/validation.utils";

const CONFIG_INVALID = "configuration is not valid for this action";
const NO_RECORD = "the trigger carried no record to act on";

function invalid(): AutomationActionOutcome {
  return { ok: false, error: CONFIG_INVALID };
}

function noRecord(): AutomationActionOutcome {
  return { ok: false, error: NO_RECORD };
}

function triggerRecordSurvives(context: AutomationActionContext): boolean {
  const trigger = context.run.triggerEvent ? automationTriggerForEvent(context.run.triggerEvent) : undefined;

  return trigger?.triggerKind !== AutomationTriggerKind.recordDeleted;
}

export class CrmAutomationActionExecutor implements AutomationActionExecutor {
  constructor(
    private records: AutomationRecordWriter,
    private createTask: CreateTaskInteractor,
    private createDeal: CreateDealInteractor,
    private createLead: CreateLeadInteractor,
    private updateDeal: UpdateDealInteractor,
    private emailSender: AutomationEmailSender,
  ) {}

  async execute(args: {
    kind: string;
    config: unknown;
    context: AutomationActionContext;
  }): Promise<AutomationActionOutcome> {
    switch (args.kind) {
      case AutomationActionKind.updateField:
        return await this.runUpdateField(args.config, args.context);
      case AutomationActionKind.assignOwner:
        return await this.runAssignOwner(args.config, args.context);
      case AutomationActionKind.addLabel:
        return await this.runAddLabel(args.config, args.context);
      case AutomationActionKind.createNote:
        return await this.runCreateNote(args.config, args.context);
      case AutomationActionKind.moveStage:
        return await this.runMoveStage(args.config, args.context);
      case AutomationActionKind.createTask:
        return await this.runCreateTask(args.config, args.context);
      case AutomationActionKind.createDeal:
        return await this.runCreateDeal(args.config);
      case AutomationActionKind.createLead:
        return await this.runCreateLead(args.config);
      case AutomationActionKind.sendEmail:
        return await this.runSendEmail(args.config);
      case AutomationActionKind.callWebhook:
        return await this.runCallWebhook(args.config, args.context);
      default:
        return { ok: false, error: `unsupported action ${args.kind}` };
    }
  }

  private async runUpdateField(config: unknown, context: AutomationActionContext): Promise<AutomationActionOutcome> {
    const parsed = UpdateFieldConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();
    if (!context.entityType || !context.entityId) return noRecord();

    return await this.records.setField({
      entityType: context.entityType,
      entityId: context.entityId,
      field: parsed.data.field,
      value: parsed.data.value,
    });
  }

  private async runAssignOwner(config: unknown, context: AutomationActionContext): Promise<AutomationActionOutcome> {
    const parsed = AssignOwnerConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();
    if (!context.entityType || !context.entityId) return noRecord();

    return await this.records.assignOwner({
      entityType: context.entityType,
      entityId: context.entityId,
      userId: parsed.data.userId,
    });
  }

  private async runAddLabel(config: unknown, context: AutomationActionContext): Promise<AutomationActionOutcome> {
    const parsed = AddLabelConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();
    if (context.entityType !== EntityType.lead || !context.entityId) return noRecord();

    return await this.records.addLeadLabels({ entityId: context.entityId, labels: parsed.data.labels });
  }

  private async runCreateNote(config: unknown, context: AutomationActionContext): Promise<AutomationActionOutcome> {
    const parsed = CreateNoteConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();
    if (!context.entityType || !context.entityId) return noRecord();

    return await this.records.appendNote({
      entityType: context.entityType,
      entityId: context.entityId,
      body: parsed.data.body,
    });
  }

  private async runMoveStage(config: unknown, context: AutomationActionContext): Promise<AutomationActionOutcome> {
    const parsed = MoveStageConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();
    if (context.entityType !== EntityType.deal || !context.entityId) return noRecord();

    const outcome = await this.updateDeal.invoke({ id: context.entityId, stageId: parsed.data.stageId });

    return isInteractorFailure(outcome)
      ? { ok: false, error: "the stage move was rejected" }
      : { ok: true, output: { stageId: parsed.data.stageId } };
  }

  private async runCreateTask(config: unknown, context: AutomationActionContext): Promise<AutomationActionOutcome> {
    const parsed = CreateTaskConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();

    const dueAt =
      parsed.data.dueInDays === null ? null : new Date(Date.now() + parsed.data.dueInDays * 24 * 60 * 60 * 1000);
    const links =
      parsed.data.linkToTriggerRecord && triggerRecordSurvives(context) && context.entityId && context.entityType
        ? this.records.taskLinksFor(context.entityType, context.entityId)
        : {};

    const outcome = await this.createTask.invoke({
      name: parsed.data.name,
      notes: null,
      userIds: parsed.data.assigneeUserId ? [parsed.data.assigneeUserId] : [],
      contactIds: links.contactIds ?? [],
      organizationIds: links.organizationIds ?? [],
      dealIds: links.dealIds ?? [],
      serviceIds: links.serviceIds ?? [],
      customFieldValues: [],
      ...(parsed.data.activityKind ? { activityKind: parsed.data.activityKind } : {}),
      ...(dueAt ? { dueAt } : {}),
    });

    return isInteractorFailure(outcome)
      ? { ok: false, error: "the task could not be created" }
      : { ok: true, output: { taskId: outcome.data.id } };
  }

  private async runCreateDeal(config: unknown): Promise<AutomationActionOutcome> {
    const parsed = CreateDealConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();

    const outcome = await this.createDeal.invoke({
      name: parsed.data.name,
      notes: null,
      userIds: parsed.data.ownerUserId ? [parsed.data.ownerUserId] : [],
      contactIds: [],
      organizationIds: [],
      taskIds: [],
      services: [],
      customFieldValues: [],
      ...(parsed.data.pipelineId ? { pipelineId: parsed.data.pipelineId } : {}),
      ...(parsed.data.stageId ? { stageId: parsed.data.stageId } : {}),
    });

    return isInteractorFailure(outcome)
      ? { ok: false, error: "the deal could not be created" }
      : { ok: true, output: { dealId: outcome.data.id } };
  }

  private async runCreateLead(config: unknown): Promise<AutomationActionOutcome> {
    const parsed = CreateLeadConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();

    const outcome = await this.createLead.invoke({
      title: parsed.data.title,
      labels: parsed.data.labels ?? [],
      ...(parsed.data.ownerUserId ? { ownerUserId: parsed.data.ownerUserId } : {}),
      sourceOrigin: "automation",
      status: LeadStatus.new,
      customFieldValues: [],
      notes: null,
    });

    return isInteractorFailure(outcome)
      ? { ok: false, error: "the lead could not be created" }
      : { ok: true, output: { leadId: outcome.data.id } };
  }

  private async runSendEmail(config: unknown): Promise<AutomationActionOutcome> {
    const parsed = SendEmailConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();

    const sent = await this.emailSender.send({
      to: parsed.data.to,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });

    return sent ? { ok: true, output: { to: parsed.data.to } } : { ok: false, error: "the email was not accepted" };
  }

  private async runCallWebhook(config: unknown, context: AutomationActionContext): Promise<AutomationActionOutcome> {
    const parsed = CallWebhookConfigSchema.safeParse(config);
    if (!parsed.success) return invalid();

    const body = {
      automationId: context.run.automationId,
      automationName: context.run.automationName,
      runId: context.run.runId,
      triggerEvent: context.run.triggerEvent,
      ...(parsed.data.includeRecord ? { entityType: context.entityType, entityId: context.entityId } : {}),
    };

    const response = await fetch(parsed.data.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    return response.ok
      ? { ok: true, output: { status: response.status } }
      : { ok: false, error: `the endpoint answered ${response.status}` };
  }
}
