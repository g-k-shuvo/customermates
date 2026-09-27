import { describe, expect, it } from "vitest";

import { historyRowsFromVisits, isSameHistory, planStageVisits, readStageChanges } from "../stage-history-backfill";

const stageIdByPipedriveId = new Map([
  [1, "stage-qualified"],
  [2, "stage-proposal"],
  [3, "stage-negotiation"],
]);

const flowEntry = (oldValue: number | null, newValue: number, at: string, field = "stage_id") => ({
  object: "dealChange",
  timestamp: at,
  data: {
    field_key: field,
    old_value: oldValue === null ? null : String(oldValue),
    new_value: String(newValue),
    log_time: at,
  },
});

describe("readStageChanges", () => {
  it("keeps only stage changes, oldest first, with where the deal came from", () => {
    const changes = readStageChanges([
      flowEntry(2, 3, "2026-03-05 10:00:00"),
      flowEntry(null, 9, "2026-03-04 10:00:00", "value"),
      flowEntry(1, 2, "2026-03-02 10:00:00"),
      { object: "note", timestamp: "2026-03-03 10:00:00", data: null },
    ]);

    expect(changes.map((change) => [change.fromStageId, change.toStageId])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(changes[0].changedAt.toISOString()).toBe("2026-03-02T10:00:00.000Z");
  });
});

describe("planStageVisits", () => {
  const addedAt = new Date("2026-03-01T09:00:00.000Z");

  it("starts in the stage the deal was created in and follows each change", () => {
    const visits = planStageVisits({
      addedAt,
      closedAt: null,
      changes: readStageChanges([flowEntry(1, 2, "2026-03-02 10:00:00"), flowEntry(2, 3, "2026-03-05 10:00:00")]),
      stageIdByPipedriveId,
      currentStageId: "stage-negotiation",
      closedInCrm: false,
    });

    expect(visits).toEqual([
      { stageId: "stage-qualified", enteredAt: addedAt },
      { stageId: "stage-proposal", enteredAt: new Date("2026-03-02T10:00:00.000Z") },
      { stageId: "stage-negotiation", enteredAt: new Date("2026-03-05T10:00:00.000Z") },
    ]);
  });

  it("uses the current stage alone when the deal never moved", () => {
    expect(
      planStageVisits({
        addedAt,
        closedAt: null,
        changes: [],
        stageIdByPipedriveId,
        currentStageId: "stage-qualified",
        closedInCrm: false,
      }),
    ).toEqual([{ stageId: "stage-qualified", enteredAt: addedAt }]);
  });

  it("appends the Won/Lost stage the migration moved a closed deal into, entered at the close time", () => {
    const closedAt = new Date("2026-03-09T12:00:00.000Z");
    const visits = planStageVisits({
      addedAt,
      closedAt,
      changes: readStageChanges([flowEntry(1, 2, "2026-03-02 10:00:00")]),
      stageIdByPipedriveId,
      currentStageId: "stage-won",
      closedInCrm: true,
    });

    expect(visits.at(-1)).toEqual({ stageId: "stage-won", enteredAt: closedAt });
  });

  it("skips unmapped stages, collapses repeats and never runs time backwards", () => {
    const visits = planStageVisits({
      addedAt,
      closedAt: null,
      changes: [
        { fromStageId: 1, toStageId: 99, changedAt: new Date("2026-03-02T00:00:00.000Z") },
        { fromStageId: 99, toStageId: 1, changedAt: new Date("2026-03-03T00:00:00.000Z") },
        { fromStageId: 1, toStageId: 2, changedAt: new Date("2026-02-01T00:00:00.000Z") },
      ],
      stageIdByPipedriveId,
      currentStageId: "stage-proposal",
      closedInCrm: false,
    });

    expect(visits.map((visit) => visit.stageId)).toEqual(["stage-qualified", "stage-proposal"]);
    expect(visits[1].enteredAt.getTime()).toBeGreaterThanOrEqual(visits[0].enteredAt.getTime());
  });

  it("leaves an open deal alone when it was moved in the CRM after the migration", () => {
    expect(
      planStageVisits({
        addedAt,
        closedAt: null,
        changes: readStageChanges([flowEntry(1, 2, "2026-03-02 10:00:00")]),
        stageIdByPipedriveId,
        currentStageId: "stage-negotiation",
        closedInCrm: false,
      }),
    ).toEqual([]);
  });
});

describe("historyRowsFromVisits and isSameHistory", () => {
  const visits = [
    { stageId: "stage-qualified", enteredAt: new Date("2026-03-01T00:00:00.000Z") },
    { stageId: "stage-proposal", enteredAt: new Date("2026-03-04T00:00:00.000Z") },
  ];

  it("closes every visit at the next one and leaves the current visit open", () => {
    expect(historyRowsFromVisits(visits)).toEqual([
      {
        fromStageId: null,
        toStageId: "stage-qualified",
        enteredAt: visits[0].enteredAt,
        exitedAt: visits[1].enteredAt,
        durationSeconds: 3 * 24 * 60 * 60,
      },
      {
        fromStageId: "stage-qualified",
        toStageId: "stage-proposal",
        enteredAt: visits[1].enteredAt,
        exitedAt: null,
        durationSeconds: null,
      },
    ]);
  });

  it("recognises a history that is already right, so a re-run writes nothing", () => {
    const planned = historyRowsFromVisits(visits);
    const stored = planned.map(({ toStageId, enteredAt, exitedAt }) => ({ toStageId, enteredAt, exitedAt }));

    expect(isSameHistory(stored, planned)).toBe(true);
    expect(isSameHistory([{ ...stored[0], enteredAt: new Date("2026-09-26T00:00:00.000Z") }, stored[1]], planned)).toBe(
      false,
    );
    expect(isSameHistory(stored.slice(0, 1), planned)).toBe(false);
  });
});
