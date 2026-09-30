import { describe, it, expect, vi } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { PreviewFunnelWidgetInteractor } from "../preview-funnel-widget.interactor";

const PIPELINE_ID = "00000000-0000-4000-8000-000000000011";
const FUNNEL = {
  pipelineName: "Sales",
  stages: [
    {
      stageId: "00000000-0000-4000-8000-000000000012",
      label: "Qualified",
      position: 0,
      enteredCount: 3,
      advancedCount: 0,
      conversionToNextPercent: null,
      nextStageLabel: null,
    },
  ],
  summary: { dealsEntered: 3, wonCount: 1, openToWonPercent: 33 },
};

describe("PreviewFunnelWidgetInteractor", () => {
  it("calculates the funnel the unsaved widget would show from the workspace's own deals", async () => {
    const repo = { calculateFunnelData: vi.fn().mockResolvedValue(FUNNEL) };

    const result = await new PreviewFunnelWidgetInteractor(repo).invoke({ pipelineId: PIPELINE_ID, periodDays: 90 });

    expect(repo.calculateFunnelData).toHaveBeenCalledWith({ pipelineId: PIPELINE_ID, periodDays: 90 });
    expect(result).toEqual({ ok: true, data: FUNNEL });
  });

  it("uses the default period when the widget has none yet", async () => {
    const repo = { calculateFunnelData: vi.fn().mockResolvedValue({ pipelineName: null, stages: [], summary: null }) };

    await new PreviewFunnelWidgetInteractor(repo).invoke({ pipelineId: PIPELINE_ID });

    expect(repo.calculateFunnelData).toHaveBeenCalledWith({ pipelineId: PIPELINE_ID, periodDays: null });
  });
});
