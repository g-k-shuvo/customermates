import type { FunnelStageDefinition, FunnelStageEntry } from "../widget-funnel";

import { describe, expect, it } from "vitest";

import { computeFunnelStages, computeFunnelSummary, conversionPercent } from "../widget-funnel";

const STAGES: FunnelStageDefinition[] = [
  { id: "lead", name: "Lead in", position: 0 },
  { id: "demo", name: "Demo", position: 1 },
  { id: "proposal", name: "Proposal", position: 2 },
  { id: "negotiation", name: "Negotiation", position: 3 },
];

function entry(dealId: string, stageId: string, day: number, isWon = false): FunnelStageEntry {
  return { dealId, stageId, enteredAt: new Date(Date.UTC(2026, 0, day)), isWon };
}

const TRANSITIONS: FunnelStageEntry[] = [
  entry("d1", "lead", 1, true),
  entry("d1", "demo", 2, true),
  entry("d1", "proposal", 3, true),
  entry("d1", "negotiation", 4, true),

  entry("d2", "lead", 1),
  entry("d2", "demo", 2),
  entry("d2", "lead", 3),
  entry("d2", "demo", 4),

  entry("d3", "lead", 1),
  entry("d3", "proposal", 2),

  entry("d4", "lead", 5),

  entry("d5", "demo", 1),
  entry("d5", "proposal", 2),
  entry("d5", "negotiation", 3),
];

const FORWARD_BACK_FORWARD: FunnelStageEntry[] = [
  entry("d6", "demo", 1),
  entry("d6", "proposal", 2),
  entry("d6", "lead", 3),
  entry("d6", "demo", 4),
];

function byStage(stageId: string) {
  const point = computeFunnelStages(STAGES, TRANSITIONS).find((candidate) => candidate.stageId === stageId);
  if (!point) throw new Error(`no funnel point for ${stageId}`);

  return point;
}

describe("computeFunnelStages entered counts", () => {
  it("counts a deal that left a stage and came back only once", () => {
    expect(byStage("demo").enteredCount).toBe(3);
  });

  it("never counts a deal in a stage it skipped over", () => {
    expect(byStage("demo").enteredCount).toBe(3);
    expect(byStage("proposal").enteredCount).toBe(3);
  });

  it("counts every distinct deal that entered the first stage in the window", () => {
    expect(byStage("lead").enteredCount).toBe(4);
  });

  it("counts a deal that joined the pipeline mid-way only in the stages it reached", () => {
    expect(byStage("negotiation").enteredCount).toBe(2);
  });
});

describe("computeFunnelStages advancement", () => {
  it("treats reaching a later stage as advancing, even when the next stage was skipped", () => {
    expect(byStage("lead").advancedCount).toBe(3);
  });

  it("does not count a deal that fell back and never went past the stage again", () => {
    expect(byStage("demo").advancedCount).toBe(2);
  });

  it("leaves the last stage with nothing to advance to", () => {
    const last = byStage("negotiation");

    expect(last.advancedCount).toBe(0);
    expect(last.nextStageLabel).toBeNull();
    expect(last.conversionToNextPercent).toBeNull();
  });

  it("counts a deal that advanced, regressed and advanced again as having passed every stage it went beyond", () => {
    const points = computeFunnelStages(STAGES, FORWARD_BACK_FORWARD);
    const advanced = new Map(points.map((point) => [point.stageId, point.advancedCount]));

    expect(advanced.get("lead")).toBe(1);
    expect(advanced.get("demo")).toBe(1);
    expect(advanced.get("proposal")).toBe(0);
  });

  it("converts every stage a regressed deal passed through, not only the ones it left after re-entering", () => {
    const points = computeFunnelStages(STAGES, FORWARD_BACK_FORWARD);
    const conversion = new Map(points.map((point) => [point.stageId, point.conversionToNextPercent]));

    expect(conversion.get("lead")).toBe(100);
    expect(conversion.get("demo")).toBe(100);
    expect(conversion.get("proposal")).toBe(0);
  });

  it("counts a deal that dropped back and stopped as having advanced past the lower stage", () => {
    const fallback = [entry("d7", "proposal", 1), entry("d7", "demo", 2)];
    const points = computeFunnelStages(STAGES, fallback);

    expect(points.find((point) => point.stageId === "demo")?.advancedCount).toBe(1);
    expect(points.find((point) => point.stageId === "proposal")?.advancedCount).toBe(0);
  });
});

describe("computeFunnelStages conversion", () => {
  it("reports conversion as the share of entered deals that got past the stage", () => {
    expect(byStage("lead").conversionToNextPercent).toBe(75);
    expect(byStage("demo").conversionToNextPercent).toBeCloseTo(66.6666, 3);
    expect(byStage("proposal").conversionToNextPercent).toBeCloseTo(66.6666, 3);
  });

  it("names the next stage by position order", () => {
    expect(byStage("lead").nextStageLabel).toBe("Demo");
    expect(byStage("demo").nextStageLabel).toBe("Proposal");
    expect(byStage("proposal").nextStageLabel).toBe("Negotiation");
  });

  it("has no conversion for a stage nothing entered", () => {
    const withEmptyStage = [...STAGES, { id: "contract", name: "Contract", position: 4 }];
    const points = computeFunnelStages(withEmptyStage, TRANSITIONS);
    const contract = points.at(-1);

    expect(contract?.enteredCount).toBe(0);
    expect(contract?.conversionToNextPercent).toBeNull();
  });
});

describe("computeFunnelStages ordering and scope", () => {
  it("emits stages in position order whatever order they arrive in", () => {
    const shuffled = [STAGES[2], STAGES[0], STAGES[3], STAGES[1]];

    expect(computeFunnelStages(shuffled, TRANSITIONS).map((point) => point.label)).toEqual([
      "Lead in",
      "Demo",
      "Proposal",
      "Negotiation",
    ]);
  });

  it("ignores entries into stages that are not part of the funnel", () => {
    const withForeignStage = [...TRANSITIONS, entry("d7", "won-stage", 2)];
    const points = computeFunnelStages(STAGES, withForeignStage);

    expect(points.map((point) => point.enteredCount)).toEqual([4, 3, 3, 2]);
  });
});

describe("computeFunnelSummary", () => {
  it("counts every distinct deal that entered the funnel once", () => {
    expect(computeFunnelSummary(TRANSITIONS).dealsEntered).toBe(5);
  });

  it("reports open-to-won over the deals that entered the funnel in the period", () => {
    const summary = computeFunnelSummary(TRANSITIONS);

    expect(summary.wonCount).toBe(1);
    expect(summary.openToWonPercent).toBe(20);
  });

  it("has no rate at all when nothing entered the funnel", () => {
    expect(computeFunnelSummary([])).toEqual({ dealsEntered: 0, wonCount: 0, openToWonPercent: null });
  });
});

describe("conversionPercent", () => {
  it("returns null rather than zero when nothing entered", () => {
    expect(conversionPercent(0, 0)).toBeNull();
  });

  it("returns zero when deals entered and none advanced", () => {
    expect(conversionPercent(0, 12)).toBe(0);
  });
});
