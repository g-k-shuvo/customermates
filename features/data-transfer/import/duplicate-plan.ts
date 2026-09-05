import type { DuplicateStrategy, ImportKeyColumn } from "../data-transfer.schema";
import type { ImportPlan, PlanIssue, PlanRow, SourceRow } from "./import-plan";
import type { MappingTarget, SourceColumn } from "./import-mapping";
import type { EntityType } from "@/generated/prisma";

import { MessagingProvider } from "@/generated/prisma";

import { asText } from "./import-plan";
import { IMPORT_ENTITIES, IMPORT_KEY_FIELDS } from "./import-entity.registry";

export type DuplicateKeyColumn = {
  index: number;
  letter: string;
  header: string;
  key: ImportKeyColumn;
};

const MESSAGING_PROVIDERS = new Set<string>(Object.values(MessagingProvider));

export function importKeyColumnFor(target: MappingTarget, entityType: EntityType): ImportKeyColumn | null {
  if (target.kind === "field")
    return IMPORT_KEY_FIELDS[entityType].includes(target.key) ? { kind: "field", key: target.key } : null;

  if (target.kind === "customField") return { kind: "customField", columnId: target.columnId };

  if (target.kind !== "identifier") return null;

  if (!IMPORT_ENTITIES[entityType].supportsIdentifiers || !MESSAGING_PROVIDERS.has(target.provider)) return null;

  return { kind: "identifier", provider: target.provider as MessagingProvider };
}

export function duplicateKeyColumns(args: {
  sources: SourceColumn[];
  mapping: MappingTarget[];
  entityType: EntityType;
}): DuplicateKeyColumn[] {
  return args.sources.flatMap((source, index) => {
    const target = args.mapping[index];
    const key = target ? importKeyColumnFor(target, args.entityType) : null;

    return key ? [{ index, letter: source.letter, header: source.header, key }] : [];
  });
}

export function duplicateKeysBySheetRow(rows: SourceRow[], columnIndex: number): Map<number, string> {
  const keys = new Map<number, string>();

  for (const row of rows) {
    const value = asText(row.cells[columnIndex] ?? null);
    if (value.length > 0) keys.set(row.sheetRow, value);
  }

  return keys;
}

function withoutBlanks(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== ""));
}

export function applyDuplicateStrategy(args: {
  plan: ImportPlan;
  strategy: DuplicateStrategy;
  column: DuplicateKeyColumn;
  keysBySheetRow: Map<number, string>;
  matches: Map<string, string[]>;
}): ImportPlan {
  const { plan, strategy, column, keysBySheetRow, matches } = args;
  if (strategy === "create") return plan;

  const create: PlanRow[] = [];
  const update = [...plan.update];
  const issues = [...plan.issues];

  const note = (row: PlanRow, code: string, value: string, blocking: boolean) => {
    const issue: PlanIssue = {
      sheetRow: row.sheetRow,
      sourceIndex: row.sourceIndex,
      columnLetter: column.letter,
      columnLabel: column.header,
      values: { value },
      code,
      blocking,
    };

    issues.push(issue);
  };

  for (const row of plan.create) {
    const value = keysBySheetRow.get(row.sheetRow);
    const ids = value === undefined ? [] : (matches.get(value) ?? []);

    if (value === undefined || ids.length === 0) {
      create.push(row);
      continue;
    }

    if (ids.length > 1) {
      note(row, "duplicateKeyAmbiguous", value, true);
      continue;
    }

    if (strategy === "skip") {
      note(row, "duplicateSkipped", value, false);
      continue;
    }

    const payload = withoutBlanks(row.payload);
    if (payload.identifiers) {
      delete payload.identifiers;
      note(row, "channelsNotUpdated", value, false);
    }

    update.push({ ...row, recordId: ids[0], payload: { ...payload, id: ids[0] } });
  }

  return { create, update, issues };
}
