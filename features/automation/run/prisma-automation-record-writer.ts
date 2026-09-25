import type { AutomationActionOutcome } from "./automation-action-executor";
import type { AutomationRecordWriter, AutomationTaskLinks } from "./automation-record-writer";

import type { Prisma } from "@/generated/prisma";
import { EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

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

const WRITABLE_SCALARS: Partial<Record<EntityType, readonly string[]>> = {
  [EntityType.contact]: ["firstName", "lastName", "jobTitle"],
  [EntityType.organization]: ["name", "website"],
  [EntityType.deal]: ["name", "probability", "expectedCloseDate"],
  [EntityType.lead]: ["title", "status", "value"],
  [EntityType.task]: ["name", "dueAt"],
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

type Delegate = {
  updateMany: (args: unknown) => Promise<{ count: number }>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  createMany: (args: unknown) => Promise<{ count: number }>;
};

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
    const model = this.modelFor(args.entityType);
    const allowed = WRITABLE_SCALARS[args.entityType] ?? [];

    if (!model || !allowed.includes(args.field))
      return { ok: false, error: `${args.field} cannot be set by an automation` };

    const delegate = this.delegate(model);
    if (!delegate) return { ok: false, error: `${args.entityType} cannot be written` };

    const { count } = await delegate.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { [args.field]: args.value },
    });

    return count === 1 ? { ok: true, output: { field: args.field } } : { ok: false, error: "the record was not found" };
  }

  async assignOwner(args: {
    entityType: EntityType;
    entityId: string;
    userId: string | null;
  }): Promise<AutomationActionOutcome> {
    const ownerColumnModel = OWNER_COLUMN_MODELS[args.entityType];

    if (ownerColumnModel) {
      const delegate = this.delegate(ownerColumnModel);
      if (!delegate) return { ok: false, error: `${args.entityType} cannot be written` };

      const { count } = await delegate.updateMany({
        where: { id: args.entityId, companyId: this.companyId },
        data: { ownerUserId: args.userId },
      });

      return count === 1
        ? { ok: true, output: { ownerUserId: args.userId } }
        : { ok: false, error: "the record was not found" };
    }

    const joinModel = JOIN_TABLE_BY_ENTITY[args.entityType];
    const joinKey = JOIN_KEY_BY_ENTITY[args.entityType];
    if (!joinModel || !joinKey) return { ok: false, error: `${args.entityType} has no owner` };

    const delegate = this.delegate(joinModel);
    if (!delegate) return { ok: false, error: `${args.entityType} cannot be written` };

    await delegate.deleteMany({ where: { [joinKey]: args.entityId, companyId: this.companyId } });
    if (args.userId) {
      await delegate.createMany({
        data: [{ [joinKey]: args.entityId, userId: args.userId, companyId: this.companyId }],
      });
    }

    return { ok: true, output: { ownerUserId: args.userId } };
  }

  async addLeadLabels(args: { entityId: string; labels: string[] }): Promise<AutomationActionOutcome> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: args.entityId, companyId: this.companyId },
      select: { labels: true },
    });
    if (!lead) return { ok: false, error: "the record was not found" };

    const labels = [...new Set([...lead.labels, ...args.labels])];

    await this.prisma.lead.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { labels },
    });

    return { ok: true, output: { labels } };
  }

  async appendNote(args: { entityType: EntityType; entityId: string; body: string }): Promise<AutomationActionOutcome> {
    const model = this.modelFor(args.entityType);
    const delegate = model ? this.delegate(model) : undefined;
    if (!delegate) return { ok: false, error: `${args.entityType} carries no notes` };

    const { count } = await delegate.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { notes: args.body as unknown as Prisma.InputJsonValue },
    });

    return count === 1 ? { ok: true, output: { written: true } } : { ok: false, error: "the record was not found" };
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
