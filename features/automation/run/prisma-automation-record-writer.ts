import type { AutomationActionOutcome } from "./automation-action-executor";
import type { AutomationRecordWriter, AutomationTaskLinks } from "./automation-record-writer";
import type { AutomationStepError } from "../automation-step-errors";
import type { NotesAppendResult } from "@/components/editor/notes-document";

import type { Prisma } from "@/generated/prisma";
import { EntityType } from "@/generated/prisma";

import { RECORD_WRITABLE_FIELDS, resolveFieldWrite } from "./automation-field-writes";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { appendMarkdownToNotes } from "@/components/editor/notes-document";

const OWNER_COLUMN_MODELS: Partial<Record<EntityType, string>> = {
  [EntityType.lead]: "lead",
};

const NOTE_MODELS: Partial<Record<EntityType, string>> = {
  [EntityType.contact]: "contact",
  [EntityType.organization]: "organization",
  [EntityType.deal]: "deal",
  [EntityType.lead]: "lead",
  [EntityType.task]: "task",
};

const JOIN_TABLE_BY_ENTITY: Partial<Record<EntityType, string>> = {
  [EntityType.contact]: "contactUser",
  [EntityType.organization]: "organizationUser",
  [EntityType.deal]: "dealUser",
  [EntityType.task]: "taskUser",
};

const JOIN_KEY_BY_ENTITY: Partial<Record<EntityType, string>> = {
  [EntityType.contact]: "contactId",
  [EntityType.organization]: "organizationId",
  [EntityType.deal]: "dealId",
  [EntityType.task]: "taskId",
};

const NOTES_REFUSAL: Record<Extract<NotesAppendResult, { ok: false }>["reason"], AutomationStepError> = {
  unreadable: "notesUnreadable",
  tooLong: "notesTooLong",
};

type Delegate = {
  updateMany: (args: unknown) => Promise<{ count: number }>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  createMany: (args: unknown) => Promise<{ count: number }>;
};

function refused(error: AutomationStepError): AutomationActionOutcome {
  return { ok: false, error };
}

export class PrismaAutomationRecordWriter extends BaseRepository implements AutomationRecordWriter {
  private delegate(model: string): Delegate | undefined {
    return (this.prisma as unknown as Record<string, Delegate>)[model];
  }

  private modelFor(entityType: EntityType): string | undefined {
    return NOTE_MODELS[entityType];
  }

  async setField(args: {
    entityType: EntityType;
    entityId: string;
    field: string;
    value: unknown;
  }): Promise<AutomationActionOutcome> {
    const write = resolveFieldWrite(RECORD_WRITABLE_FIELDS[args.entityType], args.field, args.value);
    if (!write.ok) return refused(write.error);

    const model = this.modelFor(args.entityType);
    const delegate = model ? this.delegate(model) : undefined;
    if (!delegate) return refused("recordUnsupported");

    const { count } = await delegate.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { [write.field]: write.value },
    });

    return count === 1 ? { ok: true, output: { field: write.field } } : refused("recordMissing");
  }

  @Transaction
  async assignOwner(args: {
    entityType: EntityType;
    entityId: string;
    userId: string | null;
  }): Promise<AutomationActionOutcome> {
    if (!args.userId) return refused("fieldValueMissing");

    const assignee = await this.prisma.user.findFirst({
      where: { id: args.userId, companyId: this.companyId, status: "active" },
      select: { id: true },
    });
    if (!assignee) return refused("assigneeUnavailable");

    const ownerColumnModel = OWNER_COLUMN_MODELS[args.entityType];

    if (ownerColumnModel) {
      const delegate = this.delegate(ownerColumnModel);
      if (!delegate) return refused("recordUnsupported");

      const { count } = await delegate.updateMany({
        where: { id: args.entityId, companyId: this.companyId },
        data: { ownerUserId: assignee.id },
      });

      return count === 1 ? { ok: true, output: { ownerUserId: assignee.id } } : refused("recordMissing");
    }

    const recordModel = this.modelFor(args.entityType);
    const joinModel = JOIN_TABLE_BY_ENTITY[args.entityType];
    const joinKey = JOIN_KEY_BY_ENTITY[args.entityType];
    const recordDelegate = recordModel ? this.delegate(recordModel) : undefined;
    const joinDelegate = joinModel ? this.delegate(joinModel) : undefined;
    if (!recordDelegate || !joinDelegate || !joinKey) return refused("recordUnsupported");

    const record = await recordDelegate.findFirst({
      where: { id: args.entityId, companyId: this.companyId },
      select: { id: true },
    });
    if (!record) return refused("recordMissing");

    await joinDelegate.createMany({
      data: [{ [joinKey]: args.entityId, userId: assignee.id, companyId: this.companyId }],
      skipDuplicates: true,
    });

    return { ok: true, output: { ownerUserId: assignee.id } };
  }

  @Transaction
  async addLeadLabels(args: { entityId: string; labels: string[] }): Promise<AutomationActionOutcome> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: args.entityId, companyId: this.companyId },
      select: { labels: true },
    });
    if (!lead) return refused("recordMissing");

    const labels = [...new Set([...lead.labels, ...args.labels])];

    await this.prisma.lead.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { labels },
    });

    return { ok: true, output: { labels } };
  }

  @Transaction
  async appendNote(args: { entityType: EntityType; entityId: string; body: string }): Promise<AutomationActionOutcome> {
    if (!args.body.trim()) return refused("fieldValueMissing");

    const model = this.modelFor(args.entityType);
    const delegate = model ? this.delegate(model) : undefined;
    if (!delegate) return refused("recordUnsupported");

    const existing = await delegate.findFirst({
      where: { id: args.entityId, companyId: this.companyId },
      select: { notes: true },
    });
    if (!existing) return refused("recordMissing");

    const appended = appendMarkdownToNotes(existing.notes, args.body);
    if (!appended.ok) return refused(NOTES_REFUSAL[appended.reason]);

    const { count } = await delegate.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { notes: appended.document as Prisma.InputJsonValue },
    });

    return count === 1 ? { ok: true, output: { written: true } } : refused("recordMissing");
  }

  taskLinksFor(entityType: EntityType, entityId: string): AutomationTaskLinks {
    switch (entityType) {
      case EntityType.contact:
        return { contactIds: [entityId] };
      case EntityType.organization:
        return { organizationIds: [entityId] };
      case EntityType.deal:
        return { dealIds: [entityId] };
      case EntityType.service:
        return { serviceIds: [entityId] };
      default:
        return {};
    }
  }
}
