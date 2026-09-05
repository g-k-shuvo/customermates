import { describe, it, expect } from "vitest";

import { StageKind } from "@/generated/prisma";

import { PipelineDtoSchema, PipelineStageDtoSchema } from "../pipeline.schema";
import { BaseCreatePipelineSchema, CreatePipelineStageInputSchema } from "../upsert/create-pipeline-base.schema";
import { BaseUpdatePipelineSchema } from "../upsert/update-pipeline-base.schema";
import { duplicateStageKindIndex } from "../stage-kind-uniqueness";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const STAGE_UUID = "00000000-0000-4000-8000-000000000002";

describe("duplicateStageKindIndex", () => {
  it("accepts any number of open stages", () => {
    const stages = [{ kind: StageKind.open }, { kind: StageKind.open }, { kind: StageKind.open }];

    expect(duplicateStageKindIndex(stages)).toBeNull();
  });

  it("accepts one open, one won and one lost stage", () => {
    const stages = [{ kind: StageKind.open }, { kind: StageKind.won }, { kind: StageKind.lost }];

    expect(duplicateStageKindIndex(stages)).toBeNull();
  });

  it("reports the index of the second won stage", () => {
    const stages = [{ kind: StageKind.won }, { kind: StageKind.open }, { kind: StageKind.won }];

    expect(duplicateStageKindIndex(stages)).toBe(2);
  });

  it("reports the index of the second lost stage", () => {
    const stages = [{ kind: StageKind.lost }, { kind: StageKind.lost }];

    expect(duplicateStageKindIndex(stages)).toBe(1);
  });
});

describe("CreatePipelineStageInputSchema", () => {
  it("accepts a stage with probability at the lower bound", () => {
    const result = CreatePipelineStageInputSchema.safeParse({ name: "Qualified", probability: 0 });

    expect(result.success).toBe(true);
  });

  it("accepts a stage with probability at the upper bound", () => {
    const result = CreatePipelineStageInputSchema.safeParse({ name: "Closing", probability: 100 });

    expect(result.success).toBe(true);
  });

  it("rejects a probability below 0", () => {
    const result = CreatePipelineStageInputSchema.safeParse({ name: "Qualified", probability: -1 });

    expect(result.success).toBe(false);
  });

  it("rejects a probability above 100", () => {
    const result = CreatePipelineStageInputSchema.safeParse({ name: "Qualified", probability: 101 });

    expect(result.success).toBe(false);
  });

  it("rejects a blank stage name", () => {
    const result = CreatePipelineStageInputSchema.safeParse({ name: "   ", probability: 50 });

    expect(result.success).toBe(false);
  });

  it("defaults probability, rottingDays and kind", () => {
    const result = CreatePipelineStageInputSchema.safeParse({ name: "Qualified" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.probability).toBe(0);
      expect(result.data.rottingDays).toBeNull();
      expect(result.data.kind).toBe(StageKind.open);
    }
  });

  it("rejects a rottingDays below 1", () => {
    const result = CreatePipelineStageInputSchema.safeParse({ name: "Qualified", rottingDays: 0 });

    expect(result.success).toBe(false);
  });
});

describe("BaseCreatePipelineSchema", () => {
  it("accepts a valid minimal pipeline", () => {
    const result = BaseCreatePipelineSchema.safeParse({ name: "Sales", stages: [{ name: "Open" }] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Sales");
      expect(result.data.position).toBe(0);
      expect(result.data.isDefault).toBe(false);
      expect(result.data.stages).toHaveLength(1);
    }
  });

  it("rejects a pipeline created without any stage", () => {
    const result = BaseCreatePipelineSchema.safeParse({ name: "Sales" });

    expect(result.success).toBe(false);
  });

  it("accepts a valid pipeline with stages", () => {
    const result = BaseCreatePipelineSchema.safeParse({
      name: "Sales",
      position: 2,
      isDefault: true,
      stages: [
        { name: "Lead In", probability: 10 },
        { name: "Won", probability: 100, kind: StageKind.won, rottingDays: 30 },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stages).toHaveLength(2);
      expect(result.data.stages[1].kind).toBe(StageKind.won);
      expect(result.data.stages[1].rottingDays).toBe(30);
    }
  });

  it("rejects a blank pipeline name", () => {
    const result = BaseCreatePipelineSchema.safeParse({ name: "  " });

    expect(result.success).toBe(false);
  });

  it("rejects a missing pipeline name", () => {
    const result = BaseCreatePipelineSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a nested stage probability above 100", () => {
    const result = BaseCreatePipelineSchema.safeParse({
      name: "Sales",
      stages: [{ name: "Lead In", probability: 100.5 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a nested stage probability below 0", () => {
    const result = BaseCreatePipelineSchema.safeParse({
      name: "Sales",
      stages: [{ name: "Lead In", probability: -0.5 }],
    });

    expect(result.success).toBe(false);
  });
});

describe("BaseUpdatePipelineSchema", () => {
  it("accepts an update with the id only", () => {
    const result = BaseUpdatePipelineSchema.safeParse({ id: VALID_UUID });

    expect(result.success).toBe(true);
  });

  it("accepts a default flag update", () => {
    const result = BaseUpdatePipelineSchema.safeParse({ id: VALID_UUID, isDefault: true });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isDefault).toBe(true);
  });

  it("rejects a missing id", () => {
    const result = BaseUpdatePipelineSchema.safeParse({ name: "Sales" });

    expect(result.success).toBe(false);
  });

  it("rejects a non uuid id", () => {
    const result = BaseUpdatePipelineSchema.safeParse({ id: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("rejects a blank name when provided", () => {
    const result = BaseUpdatePipelineSchema.safeParse({ id: VALID_UUID, name: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a negative position", () => {
    const result = BaseUpdatePipelineSchema.safeParse({ id: VALID_UUID, position: -1 });

    expect(result.success).toBe(false);
  });
});

describe("PipelineStageDtoSchema", () => {
  function makeStage(overrides: Record<string, unknown> = {}) {
    return {
      id: STAGE_UUID,
      name: "Lead In",
      position: 0,
      probability: 25,
      rottingDays: null,
      kind: StageKind.open,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      ...overrides,
    };
  }

  it("parses a valid stage dto", () => {
    const result = PipelineStageDtoSchema.safeParse(makeStage());

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.probability).toBe(25);
  });

  it("rejects a probability below 0", () => {
    const result = PipelineStageDtoSchema.safeParse(makeStage({ probability: -1 }));

    expect(result.success).toBe(false);
  });

  it("rejects a probability above 100", () => {
    const result = PipelineStageDtoSchema.safeParse(makeStage({ probability: 101 }));

    expect(result.success).toBe(false);
  });
});

describe("PipelineDtoSchema", () => {
  it("parses a valid pipeline dto with stages", () => {
    const result = PipelineDtoSchema.safeParse({
      id: VALID_UUID,
      name: "Sales",
      position: 0,
      isDefault: true,
      archivedAt: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      stages: [
        {
          id: STAGE_UUID,
          name: "Lead In",
          position: 0,
          probability: 0,
          rottingDays: 14,
          kind: StageKind.open,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01"),
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stages).toHaveLength(1);
      expect(result.data.stages[0].rottingDays).toBe(14);
    }
  });

  it("rejects a pipeline dto whose stage probability is out of range", () => {
    const result = PipelineDtoSchema.safeParse({
      id: VALID_UUID,
      name: "Sales",
      position: 0,
      isDefault: false,
      archivedAt: null,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
      stages: [
        {
          id: STAGE_UUID,
          name: "Lead In",
          position: 0,
          probability: 120,
          rottingDays: null,
          kind: StageKind.open,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01"),
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
