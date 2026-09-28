import type { z } from "zod";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { parseWebFormAmount } from "./field-mapping";

import { validateCustomFieldValues } from "@/core/validation/validate-custom-field-values";

export type WebFormCustomFieldValue = { columnId: string; value: string };
export type WebFormCustomFieldTargets = { lead: WebFormCustomFieldValue[]; contact: WebFormCustomFieldValue[] };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DOTTED_DAY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

function isoDay(raw: string): string | null {
  const text = raw.trim();
  if (ISO_DAY.test(text)) return text;

  const dotted = DOTTED_DAY.exec(text);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;

  const parsed = new Date(text);

  return /^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : null;
}

function e164(raw: string): string | null {
  const compact = raw.replace(/[\s().\-/]/g, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;

  return international.startsWith("+") ? international : null;
}

function coerce(column: CustomColumnDto, raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  switch (column.type) {
    case CustomColumnType.singleSelect: {
      const wanted = text.toLowerCase();
      const option = column.options.options.find(
        (candidate) => candidate.label.trim().toLowerCase() === wanted || candidate.value.toLowerCase() === wanted,
      );
      return option?.value ?? null;
    }
    case CustomColumnType.currency: {
      const amount = parseWebFormAmount(text);
      return amount === null ? null : String(amount);
    }
    case CustomColumnType.phone:
      return e164(text);
    case CustomColumnType.date:
      return isoDay(text);
    case CustomColumnType.dateTime: {
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    case CustomColumnType.dateRange:
    case CustomColumnType.dateTimeRange:
    case CustomColumnType.relation:
      return null;
    default:
      return text;
  }
}

function passesValidation(column: CustomColumnDto, value: string): boolean {
  let valid = true;
  const ctx = {
    addIssue: () => {
      valid = false;
    },
  } as unknown as z.RefinementCtx;

  validateCustomFieldValues([{ columnId: column.id, value }], [column], ctx, []);

  return valid;
}

export function webFormCustomFieldValues(
  mapped: readonly { columnId: string; raw: string }[],
  columns: readonly CustomColumnDto[],
): WebFormCustomFieldTargets {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const targets: WebFormCustomFieldTargets = { lead: [], contact: [] };

  for (const entry of mapped) {
    const column = byId.get(entry.columnId);
    if (!column || (column.entityType !== EntityType.lead && column.entityType !== EntityType.contact)) continue;

    const value = coerce(column, entry.raw);
    if (value === null || !passesValidation(column, value)) continue;

    const bucket = column.entityType === EntityType.lead ? targets.lead : targets.contact;
    const existing = bucket.findIndex((candidate) => candidate.columnId === column.id);
    if (existing >= 0) bucket[existing] = { columnId: column.id, value };
    else bucket.push({ columnId: column.id, value });
  }

  return targets;
}
