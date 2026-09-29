import type { AutomationStepError } from "../automation-step-errors";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { z } from "zod";

import { CustomColumnType, EntityType, LeadStatus } from "@/generated/prisma";

import { validateCustomFieldValues } from "@/core/validation/validate-custom-field-values";

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

export const CUSTOM_WRITABLE_TYPES: ReadonlySet<CustomColumnType> = new Set([
  CustomColumnType.plain,
  CustomColumnType.email,
  CustomColumnType.phone,
  CustomColumnType.link,
  CustomColumnType.currency,
  CustomColumnType.singleSelect,
  CustomColumnType.date,
  CustomColumnType.dateTime,
]);

export type ResolvedCustomFieldWrite = { ok: true; value: string | null } | { ok: false; error: AutomationStepError };

export function isCustomFieldKey(field: string): boolean {
  return z.uuid().safeParse(field).success;
}

export function resolveCustomFieldWrite(column: CustomColumnDto | undefined, value: unknown): ResolvedCustomFieldWrite {
  if (!column || !CUSTOM_WRITABLE_TYPES.has(column.type)) return { ok: false, error: "fieldNotWritable" };
  if (value === null || (typeof value === "string" && value.trim() === "")) return { ok: true, value: null };
  if (typeof value !== "string" && typeof value !== "number") return { ok: false, error: "fieldValueInvalid" };

  const text = String(value).trim();
  const checked = z
    .unknown()
    .superRefine((_, ctx) => validateCustomFieldValues([{ columnId: column.id, value: text }], [column], ctx, []))
    .safeParse(null);

  return checked.success ? { ok: true, value: text } : { ok: false, error: "fieldValueInvalid" };
}
