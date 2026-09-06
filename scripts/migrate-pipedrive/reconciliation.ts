/**
 * The final reconciliation: source count vs target count per entity, plus every
 * skipped record with its reason and every source value that had no home.
 *
 * Pure, so the report shape is unit tested (`__tests__/reconciliation.test.ts`)
 * rather than eyeballed at the end of a long run.
 */

export const MIGRATION_ENTITIES = [
  "organizations",
  "contacts",
  "pipelines",
  "stages",
  "lostReasons",
  "deals",
  "tasks",
  "notes",
] as const;

export type MigrationEntity = (typeof MIGRATION_ENTITIES)[number];

export type SkippedRecord = { entity: MigrationEntity; sourceId: string; label: string; reason: string };

export type UnmappedValue = { kind: string; value: string; occurrences: number; detail?: string };

export type EntityTally = {
  sourceCount: number;
  created: number;
  updated: number;
  unchanged: number;
  targetCount: number;
};

export type EntityLine = EntityTally & { entity: MigrationEntity; skipped: number; reconciled: boolean };

export type ReconciliationReport = {
  dryRun: boolean;
  startedAt: Date;
  finishedAt: Date;
  entities: EntityLine[];
  skipped: SkippedRecord[];
  unmapped: UnmappedValue[];
  reconciled: boolean;
};

export function emptyTally(): EntityTally {
  return { sourceCount: 0, created: 0, updated: 0, unchanged: 0, targetCount: 0 };
}

export function buildReconciliationReport(input: {
  dryRun: boolean;
  startedAt: Date;
  finishedAt: Date;
  tallies: Partial<Record<MigrationEntity, EntityTally>>;
  skipped: readonly SkippedRecord[];
  unmapped: readonly UnmappedValue[];
}): ReconciliationReport {
  const skippedByEntity = new Map<MigrationEntity, number>();
  for (const record of input.skipped) skippedByEntity.set(record.entity, (skippedByEntity.get(record.entity) ?? 0) + 1);

  const entities = MIGRATION_ENTITIES.flatMap((entity): EntityLine[] => {
    const tally = input.tallies[entity];
    const skipped = skippedByEntity.get(entity) ?? 0;
    if (!tally && skipped === 0) return [];

    const resolved = tally ?? emptyTally();

    return [
      {
        entity,
        ...resolved,
        skipped,
        reconciled: resolved.sourceCount === resolved.targetCount + skipped,
      },
    ];
  });

  const unmapped = [...input.unmapped].sort((a, b) => {
    if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.value === b.value) return 0;

    return a.value < b.value ? -1 : 1;
  });

  return {
    dryRun: input.dryRun,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    entities,
    skipped: [...input.skipped],
    unmapped,
    reconciled: entities.every((line) => line.reconciled),
  };
}

function column(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

export function renderReconciliationReport(report: ReconciliationReport): string {
  const lines: string[] = [];
  const seconds = Math.max(0, Math.round((report.finishedAt.getTime() - report.startedAt.getTime()) / 1000));

  lines.push(report.dryRun ? "Pipedrive migration — DRY RUN (nothing was written)" : "Pipedrive migration — complete");
  lines.push(`Finished ${report.finishedAt.toISOString()} after ${seconds}s`);
  lines.push("");
  lines.push(
    [
      column("entity", 14),
      column("source", 8),
      column("target", 8),
      column("created", 8),
      column("updated", 8),
      column("skipped", 8),
      "status",
    ].join(""),
  );

  for (const line of report.entities) {
    lines.push(
      [
        column(line.entity, 14),
        column(String(line.sourceCount), 8),
        column(String(line.targetCount), 8),
        column(String(line.created), 8),
        column(String(line.updated), 8),
        column(String(line.skipped), 8),
        line.reconciled ? "ok" : "MISMATCH",
      ].join(""),
    );
  }

  lines.push("");
  lines.push(report.reconciled ? "Every entity reconciles." : "One or more entities do NOT reconcile — see above.");

  if (report.unmapped.length > 0) {
    lines.push("");
    lines.push(`Unmapped source values (${report.unmapped.length}):`);
    for (const entry of report.unmapped)
      lines.push(`  ${entry.kind}: ${entry.value} (x${entry.occurrences})${entry.detail ? ` — ${entry.detail}` : ""}`);
  }

  if (report.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped records (${report.skipped.length}):`);
    for (const record of report.skipped)
      lines.push(`  ${record.entity} ${record.sourceId} "${record.label}" — ${record.reason}`);
  }

  return lines.join("\n");
}

/** Collects skip reasons and unmapped values while the run is in progress. */
export class MigrationLedger {
  private readonly tallies = new Map<MigrationEntity, EntityTally>();
  private readonly skippedRecords: SkippedRecord[] = [];
  private readonly unmappedValues = new Map<string, UnmappedValue>();

  tally(entity: MigrationEntity): EntityTally {
    const existing = this.tallies.get(entity);
    if (existing) return existing;

    const created = emptyTally();
    this.tallies.set(entity, created);

    return created;
  }

  skip(record: SkippedRecord): void {
    this.skippedRecords.push(record);
  }

  unmapped(kind: string, value: string, detail?: string): void {
    const key = `${kind}::${value}`;
    const existing = this.unmappedValues.get(key);

    if (existing) {
      existing.occurrences += 1;
      return;
    }

    this.unmappedValues.set(key, { kind, value, occurrences: 1, ...(detail ? { detail } : {}) });
  }

  report(args: { dryRun: boolean; startedAt: Date; finishedAt: Date }): ReconciliationReport {
    return buildReconciliationReport({
      ...args,
      tallies: Object.fromEntries(this.tallies) as Partial<Record<MigrationEntity, EntityTally>>,
      skipped: this.skippedRecords,
      unmapped: [...this.unmappedValues.values()],
    });
  }
}
