import type { AutomationStepError } from "../automation-step-errors";

import { EntityType, LeadStatus } from "@/generated/prisma";

type FieldKind = "text" | "number" | "date" | "leadStatus";

export type WritableField = { kind: FieldKind; required: boolean };

export type WritableFields = Readonly<Record<string, WritableField>>;

export type FieldWriteValue = string | number | Date | null;

export type ResolvedFieldWrite =
  | { ok: true; field: string; value: FieldWriteValue }
  | { ok: false; error: AutomationStepError };

const REQUIRED_TEXT: WritableField = { kind: "text", required: true };

export const DEAL_WRITABLE_FIELDS: WritableFields = {
  name: REQUIRED_TEXT,
  probability: { kind: "number", required: false },
  expectedCloseDate: { kind: "date", required: false },
};

export const RECORD_WRITABLE_FIELDS: Partial<Record<EntityType, WritableFields>> = {
  [EntityType.contact]: { firstName: REQUIRED_TEXT, lastName: REQUIRED_TEXT },
  [EntityType.organization]: { name: REQUIRED_TEXT },
  [EntityType.lead]: {
    title: REQUIRED_TEXT,
    status: { kind: "leadStatus", required: true },
    value: { kind: "number", required: false },
  },
  [EntityType.task]: { name: REQUIRED_TEXT, dueAt: { kind: "date", required: false } },
};

function coerced(kind: FieldKind, value: unknown): FieldWriteValue | undefined {
  if (kind === "number") {
    const parsed = typeof value === "number" ? value : Number(String(value).trim());

    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (kind === "date") {
    const parsed = value instanceof Date ? value : new Date(String(value));

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (kind === "leadStatus") {
    const candidate = String(value);

    return Object.hasOwn(LeadStatus, candidate) ? candidate : undefined;
  }

  return String(value);
}

export function resolveFieldWrite(
  fields: WritableFields | undefined,
  field: string,
  value: unknown,
): ResolvedFieldWrite {
  const rule = fields && Object.hasOwn(fields, field) ? fields[field] : undefined;
  if (!rule) return { ok: false, error: "fieldNotWritable" };

  if (value === null) return rule.required ? { ok: false, error: "fieldValueMissing" } : { ok: true, field, value };
  if (typeof value === "string" && value.trim() === "") return { ok: false, error: "fieldValueMissing" };

  const next = coerced(rule.kind, value);

  return next === undefined ? { ok: false, error: "fieldValueInvalid" } : { ok: true, field, value: next };
}
