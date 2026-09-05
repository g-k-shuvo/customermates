import { describe, expect, it } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

import { stageDeletionConflict } from "../stage-deletion-conflict";

describe("stageDeletionConflict", () => {
  it("reads the deal count out of a stage-has-deals failure", () => {
    const error = createZodError("Pipelines.stageHasDeals", ["id"], {
      count: 7,
      error: CustomErrorCode.pipelineStageHasDeals,
      kind: "conflict",
    });

    expect(stageDeletionConflict(error)).toEqual({
      code: CustomErrorCode.pipelineStageHasDeals,
      dealCount: 7,
    });
  });

  it("reports a count of zero rather than treating it as absent", () => {
    const error = createZodError("Pipelines.stageHasDeals", ["id"], {
      count: 0,
      error: CustomErrorCode.pipelineStageHasDeals,
    });

    expect(stageDeletionConflict(error)?.dealCount).toBe(0);
  });

  it("ignores a different conflict code", () => {
    const error = createZodError("Pipelines.lastStage", ["id"], {
      error: CustomErrorCode.pipelineStageLastInPipeline,
    });

    expect(stageDeletionConflict(error)).toBeUndefined();
  });

  it("ignores the right code when the count is missing or not a number", () => {
    const missing = createZodError("Pipelines.stageHasDeals", ["id"], {
      error: CustomErrorCode.pipelineStageHasDeals,
    });
    const wrongType = createZodError("Pipelines.stageHasDeals", ["id"], {
      count: "7",
      error: CustomErrorCode.pipelineStageHasDeals,
    });

    expect(stageDeletionConflict(missing)).toBeUndefined();
    expect(stageDeletionConflict(wrongType)).toBeUndefined();
  });

  it("finds the conflict among unrelated issues", () => {
    const error = createZodError("Pipelines.stageHasDeals", ["id"], {
      count: 3,
      error: CustomErrorCode.pipelineStageHasDeals,
    });
    error.issues.unshift({ code: "custom", path: ["name"], message: "unrelated" });

    expect(stageDeletionConflict(error)?.dealCount).toBe(3);
  });

  it("returns undefined for an error carrying no custom issues", () => {
    const error = createZodError("plain", ["id"]);

    expect(stageDeletionConflict(error)).toBeUndefined();
  });
});
