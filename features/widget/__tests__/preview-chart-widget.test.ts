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

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { PreviewChartWidgetInteractor } from "../preview-chart-widget.interactor";

const CONFIG = {
  entityType: EntityType.contact,
  entityFilters: [],
  dealFilters: [],
  groupByType: WidgetGroupByType.none,
  groupByCustomColumnId: null,
  aggregationType: AggregationType.count,
  periodDays: null,
  displayOptions: null,
};

const CALCULATION = {
  data: [{ labelKind: "literal" as const, label: "Total", value: 37 }],
  dataSummary: null,
};

describe("PreviewChartWidgetInteractor", () => {
  it("calculates what the unsaved chart would show from the workspace's own records", async () => {
    const repo = { calculateWidgetData: vi.fn().mockResolvedValue(CALCULATION) };

    const result = await new PreviewChartWidgetInteractor(repo).invoke(CONFIG);

    expect(repo.calculateWidgetData).toHaveBeenCalledWith(CONFIG);
    expect(result).toEqual({ ok: true, data: CALCULATION });
  });

  it("refuses a configuration that is not a chart widget", async () => {
    const repo = { calculateWidgetData: vi.fn() };

    const result = await new PreviewChartWidgetInteractor(repo).invoke({ ...CONFIG, aggregationType: "nope" } as never);

    expect(result.ok).toBe(false);
    expect(repo.calculateWidgetData).not.toHaveBeenCalled();
  });
});
