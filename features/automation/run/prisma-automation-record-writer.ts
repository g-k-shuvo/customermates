import type { AutomationActionOutcome } from "./automation-action-executor";
import type { AutomationRecordWriter, AutomationTaskLinks } from "./automation-record-writer";

import type { Prisma } from "@/generated/prisma";
import { EntityType, LeadStatus } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";

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

type ScalarKind = "text" | "number" | "date" | "leadStatus";

const SCALAR_KINDS: Record<string, ScalarKind> = {
  "deal.probability": "number",
  "deal.expectedCloseDate": "date",
  "lead.value": "number",
  "lead.status": "leadStatus",
  "task.dueAt": "date",
};

function coerceScalar(kind: ScalarKind, value: unknown): { ok: true; value: unknown } | { ok: false } {
  if (value === null) return { ok: true, value: null };

  if (kind === "number") {
    const parsed = typeof value === "number" ? value : Number(String(value).trim());

    return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false };
  }

  if (kind === "date") {
    const parsed = value instanceof Date ? value : new Date(String(value));

    return Number.isNaN(parsed.getTime()) ? { ok: false } : { ok: true, value: parsed };
  }

  if (kind === "leadStatus") {
    const candidate = String(value);

    return candidate in LeadStatus ? { ok: true, value: candidate } : { ok: false };
  }

  return { ok: true, value: String(value) };
}

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

function notesAsMarkdown(notes: unknown): string {
  if (!notes) return "";
  if (typeof notes === "string") return notes.trim();

  return serializeJSONToMarkdown(notes as object).trim();
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
    const model = this.modelFor(args.entityType);
    const allowed = WRITABLE_SCALARS[args.entityType] ?? [];

    if (!model || !allowed.includes(args.field))
      return { ok: false, error: `${args.field} cannot be set by an automation` };

    const delegate = this.delegate(model);
    if (!delegate) return { ok: false, error: `${args.entityType} cannot be written` };

    const coerced = coerceScalar(SCALAR_KINDS[`${args.entityType}.${args.field}`] ?? "text", args.value);
    if (!coerced.ok) return { ok: false, error: `${args.field} cannot hold that value` };

    const { count } = await delegate.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { [args.field]: coerced.value },
    });

    return count === 1 ? { ok: true, output: { field: args.field } } : { ok: false, error: "the record was not found" };
  }

  async assignOwner(args: {
    entityType: EntityType;
    entityId: string;
    userId: string | null;
  }): Promise<AutomationActionOutcome> {
    if (!args.userId) return { ok: false, error: "no user was configured for this action" };

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

    await delegate.createMany({
      data: [{ [joinKey]: args.entityId, userId: args.userId, companyId: this.companyId }],
      skipDuplicates: true,
    });

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

    const existing = await delegate.findFirst({
      where: { id: args.entityId, companyId: this.companyId },
      select: { notes: true },
    });
    if (!existing) return { ok: false, error: "the record was not found" };

    const previous = notesAsMarkdown(existing.notes);
    const combined = previous ? `${previous}\n\n${args.body}` : args.body;

    const { count } = await delegate.updateMany({
      where: { id: args.entityId, companyId: this.companyId },
      data: { notes: parseMarkdownToJSON(combined) as Prisma.InputJsonValue },
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
