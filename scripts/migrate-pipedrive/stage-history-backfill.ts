/**
 * Pure planning for the stage-history backfill. The migration replays a deal's stage changes
 * through the REST API, so every DealStageHistory row it leaves carries the migration's own
 * timestamps. These functions rebuild the history a migrated deal should have from Pipedrive's
 * deal flow, so the days-in-stage bar shows the durations the deal really had.
 */

import type { PipedriveFlowEntry } from "./pipedrive.types";

import { parsePipedriveDate, parsePipedriveNumber } from "./pipedrive.types";

export type PipedriveStageChange = { fromStageId: number | null; toStageId: number; changedAt: Date };

export type StageVisit = { stageId: string; enteredAt: Date };

export type PlannedHistoryRow = {
  fromStageId: string | null;
  toStageId: string;
  enteredAt: Date;
  exitedAt: Date | null;
  durationSeconds: number | null;
};

export type ExistingHistoryRow = { toStageId: string; enteredAt: Date; exitedAt: Date | null };

/** Every `stage_id` change in a deal flow, oldest first, keeping where the deal came from. */
export function readStageChanges(flow: readonly PipedriveFlowEntry[]): PipedriveStageChange[] {
  const changes = flow.flatMap((entry): PipedriveStageChange[] => {
    const data = entry.data;
    if (!data || data.field_key !== "stage_id") return [];

    const toStageId = parsePipedriveNumber(data.new_value);
    const changedAt = parsePipedriveDate(data.log_time ?? entry.timestamp);
    if (toStageId === null || !changedAt) return [];

    return [{ fromStageId: parsePipedriveNumber(data.old_value), toStageId, changedAt }];
  });

  return changes.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
}

/**
 * The stages a deal visited, in order, with the moment it entered each one.
 *
 * - The first visit is the stage the deal was created in, entered at `addedAt`.
 * - Each Pipedrive stage change becomes a visit; unmapped stages are skipped and repeats collapse.
 * - When a CLOSED CRM deal ended somewhere the flow never went (the migration moves closed deals
 *   into the Won/Lost stage), that stage is appended, entered at the close time.
 * - When an OPEN CRM deal is no longer where the flow ended, somebody moved it in the CRM after the
 *   migration: its history is real and is not rebuilt, so the plan is empty.
 * - Timestamps never run backwards, so no visit gets a negative duration.
 */
export function planStageVisits(args: {
  addedAt: Date | null;
  closedAt: Date | null;
  changes: readonly PipedriveStageChange[];
  stageIdByPipedriveId: ReadonlyMap<number, string>;
  currentStageId: string | null;
  closedInCrm: boolean;
}): StageVisit[] {
  const visits: StageVisit[] = [];

  const visit = (stageId: string | undefined | null, at: Date | null) => {
    if (!stageId || !at) return;

    const previous = visits.at(-1);
    if (previous?.stageId === stageId) return;

    const enteredAt = previous && at.getTime() < previous.enteredAt.getTime() ? previous.enteredAt : at;
    visits.push({ stageId, enteredAt });
  };

  const [first] = args.changes;
  const initialStageId = first
    ? first.fromStageId === null
      ? undefined
      : args.stageIdByPipedriveId.get(first.fromStageId)
    : args.currentStageId;

  visit(initialStageId, args.addedAt ?? first?.changedAt ?? null);

  for (const change of args.changes) visit(args.stageIdByPipedriveId.get(change.toStageId), change.changedAt);

  const last = visits.at(-1);
  if (args.currentStageId && last?.stageId !== args.currentStageId) {
    if (!args.closedInCrm) return [];
    visit(args.currentStageId, args.closedAt ?? last?.enteredAt ?? args.addedAt);
  }

  return visits;
}

export function historyRowsFromVisits(visits: readonly StageVisit[]): PlannedHistoryRow[] {
  return visits.map((visit, index) => {
    const next = visits[index + 1];
    const exitedAt = next ? next.enteredAt : null;

    return {
      fromStageId: index === 0 ? null : visits[index - 1].stageId,
      toStageId: visit.stageId,
      enteredAt: visit.enteredAt,
      exitedAt,
      durationSeconds: exitedAt ? Math.round((exitedAt.getTime() - visit.enteredAt.getTime()) / 1000) : null,
    };
  });
}

/** True when the stored history already is the planned one, so a re-run writes nothing. */
export function isSameHistory(existing: readonly ExistingHistoryRow[], planned: readonly PlannedHistoryRow[]): boolean {
  if (existing.length !== planned.length) return false;

  return existing.every((row, index) => {
    const target = planned[index];

    return (
      row.toStageId === target.toStageId &&
      row.enteredAt.getTime() === target.enteredAt.getTime() &&
      (row.exitedAt?.getTime() ?? null) === (target.exitedAt?.getTime() ?? null)
    );
  });
}
