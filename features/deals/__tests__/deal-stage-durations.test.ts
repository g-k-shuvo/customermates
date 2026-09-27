import type { StageDurationHistoryRow, StageDurationStage } from "../deal-stage-durations";

import { describe, expect, it } from "vitest";
import { StageKind } from "@/generated/prisma";

import { summarizeDealStageDurations } from "../deal-stage-durations";
import { DealStageDurationsDtoSchema } from "../deal-stage-durations.schema";

const DEAL_ID = "50000000-0000-4000-8000-000000000001";
const PIPELINE_ID = "50000000-0000-4000-8000-000000000010";
const QUALIFIED = "50000000-0000-4000-8000-000000000021";
const PROPOSAL = "50000000-0000-4000-8000-000000000022";
const NEGOTIATION = "50000000-0000-4000-8000-000000000023";
const WON = "50000000-0000-4000-8000-000000000024";
const FOREIGN_STAGE = "50000000-0000-4000-8000-000000000099";

const NOW = new Date("2026-03-10T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const STAGES: StageDurationStage[] = [
  { id: QUALIFIED, name: "Qualified", position: 0, kind: StageKind.open },
  { id: PROPOSAL, name: "Proposal", position: 1, kind: StageKind.open },
  { id: NEGOTIATION, name: "Negotiation", position: 2, kind: StageKind.open },
  { id: WON, name: "Won", position: 3, kind: StageKind.won },
];

function ago(milliseconds: number): Date {
  return new Date(NOW.getTime() - milliseconds);
}

function closed(toStageId: string, enteredAt: Date, exitedAt: Date, durationSeconds?: number | null) {
  return {
    toStageId,
    enteredAt,
    exitedAt,
    durationSeconds:
      durationSeconds === undefined ? Math.round((exitedAt.getTime() - enteredAt.getTime()) / 1000) : durationSeconds,
  };
}

function open(toStageId: string, enteredAt: Date): StageDurationHistoryRow {
  return { toStageId, enteredAt, exitedAt: null, durationSeconds: null };
}

function summarize(
  history: StageDurationHistoryRow[],
  {
    stageId,
    stageEnteredAt,
    pipelineId = PIPELINE_ID,
  }: { stageId: string | null; stageEnteredAt: Date | null; pipelineId?: string | null },
  stages: StageDurationStage[] = STAGES,
) {
  return summarizeDealStageDurations({
    deal: { id: DEAL_ID, pipelineId, stageId, stageEnteredAt },
    stages,
    history,
    now: NOW,
  });
}

function secondsByStage(result: ReturnType<typeof summarize>) {
  return Object.fromEntries(result.stages.map((stage) => [stage.name, stage.durationSeconds]));
}

describe("summarizeDealStageDurations", () => {
  it("adds up every visit of a stage and counts the open one up to now", () => {
    const result = summarize(
      [
        closed(QUALIFIED, ago(10 * DAY), ago(8 * DAY)),
        closed(PROPOSAL, ago(8 * DAY), ago(5 * DAY)),
        closed(QUALIFIED, ago(5 * DAY), ago(4 * DAY)),
        open(NEGOTIATION, ago(4 * DAY)),
      ],
      { stageId: NEGOTIATION, stageEnteredAt: ago(4 * DAY) },
    );

    expect(secondsByStage(result)).toEqual({
      Qualified: (3 * DAY) / 1000,
      Proposal: (3 * DAY) / 1000,
      Negotiation: (4 * DAY) / 1000,
      Won: 0,
    });
    expect(result.stages.map((stage) => [stage.name, stage.visits, stage.isCurrent])).toEqual([
      ["Qualified", 2, false],
      ["Proposal", 1, false],
      ["Negotiation", 1, true],
      ["Won", 0, false],
    ]);
    expect(result.stages[0].lastEnteredAt).toEqual(ago(5 * DAY));
    expect(result.currentStageId).toBe(NEGOTIATION);
    expect(result.measuredAt).toEqual(NOW);
  });

  it("lists the stages the deal never entered with no time, in pipeline order", () => {
    const result = summarize([open(QUALIFIED, ago(2 * HOUR))], { stageId: QUALIFIED, stageEnteredAt: ago(2 * HOUR) });

    expect(result.stages.map((stage) => stage.stageId)).toEqual([QUALIFIED, PROPOSAL, NEGOTIATION, WON]);
    expect(result.stages.slice(1)).toEqual(
      STAGES.slice(1).map((stage) =>
        expect.objectContaining({ stageId: stage.id, durationSeconds: 0, visits: 0, lastEnteredAt: null }),
      ),
    );
    expect(result.stages[0].durationSeconds).toBe(7_200);
  });

  it("prefers the recorded duration of a closed visit and computes it when none was recorded", () => {
    const result = summarize(
      [
        closed(QUALIFIED, ago(3 * DAY), ago(2 * DAY), 60),
        closed(PROPOSAL, ago(2 * DAY), ago(DAY), null),
        open(NEGOTIATION, ago(DAY)),
      ],
      { stageId: NEGOTIATION, stageEnteredAt: ago(DAY) },
    );

    expect(secondsByStage(result)).toMatchObject({ Qualified: 60, Proposal: DAY / 1000 });
  });

  it("ends a visit that was never closed where the next one starts, so a lost close is not counted twice", () => {
    const result = summarize([open(QUALIFIED, ago(5 * DAY)), open(PROPOSAL, ago(2 * DAY))], {
      stageId: PROPOSAL,
      stageEnteredAt: ago(2 * DAY),
    });

    expect(secondsByStage(result)).toMatchObject({ Qualified: (3 * DAY) / 1000, Proposal: (2 * DAY) / 1000 });
  });

  it("measures the current stage from the deal when its history row is missing", () => {
    const result = summarize([closed(QUALIFIED, ago(5 * DAY), ago(3 * DAY))], {
      stageId: PROPOSAL,
      stageEnteredAt: ago(3 * DAY),
    });

    expect(secondsByStage(result)).toMatchObject({ Qualified: (2 * DAY) / 1000, Proposal: (3 * DAY) / 1000 });
    expect(result.stages[1]).toMatchObject({ visits: 1, isCurrent: true, lastEnteredAt: ago(3 * DAY) });
  });

  it("stops a stale open visit where the deal entered its current stage", () => {
    const result = summarize([open(QUALIFIED, ago(6 * DAY))], { stageId: PROPOSAL, stageEnteredAt: ago(DAY) });

    expect(secondsByStage(result)).toMatchObject({ Qualified: (5 * DAY) / 1000, Proposal: DAY / 1000 });
  });

  it("measures a deal that has no history at all from the moment it entered its stage", () => {
    const result = summarize([], { stageId: QUALIFIED, stageEnteredAt: ago(90_000) });

    expect(result.stages[0]).toMatchObject({ durationSeconds: 90, visits: 1, isCurrent: true });
  });

  it("marks the terminal stage current once the deal is closed", () => {
    const result = summarize([closed(QUALIFIED, ago(4 * DAY), ago(DAY)), open(WON, ago(DAY))], {
      stageId: WON,
      stageEnteredAt: ago(DAY),
    });

    expect(result.stages.find((stage) => stage.isCurrent)).toMatchObject({ stageId: WON, kind: StageKind.won });
    expect(secondsByStage(result)).toMatchObject({ Qualified: (3 * DAY) / 1000, Won: DAY / 1000 });
  });

  it("leaves out time spent in a pipeline the deal was moved out of", () => {
    const result = summarize([closed(FOREIGN_STAGE, ago(9 * DAY), ago(2 * DAY)), open(QUALIFIED, ago(2 * DAY))], {
      stageId: QUALIFIED,
      stageEnteredAt: ago(2 * DAY),
    });

    expect(result.stages.map((stage) => stage.stageId)).not.toContain(FOREIGN_STAGE);
    expect(result.stages[0].durationSeconds).toBe((2 * DAY) / 1000);
  });

  it("never reports negative time for a visit stamped after the measurement", () => {
    const result = summarize([open(QUALIFIED, new Date(NOW.getTime() + HOUR))], {
      stageId: QUALIFIED,
      stageEnteredAt: new Date(NOW.getTime() + HOUR),
    });

    expect(result.stages[0].durationSeconds).toBe(0);
  });

  it("returns an empty stage list for a deal without a pipeline", () => {
    const result = summarize([], { stageId: null, stageEnteredAt: null, pipelineId: null }, []);

    expect(result).toEqual({
      dealId: DEAL_ID,
      pipelineId: null,
      currentStageId: null,
      measuredAt: NOW,
      stages: [],
    });
  });

  it("produces a payload the response schema accepts", () => {
    const result = summarize([closed(QUALIFIED, ago(3 * DAY), ago(DAY)), open(PROPOSAL, ago(DAY))], {
      stageId: PROPOSAL,
      stageEnteredAt: ago(DAY),
    });

    expect(DealStageDurationsDtoSchema.parse(result)).toEqual(result);
  });
});
