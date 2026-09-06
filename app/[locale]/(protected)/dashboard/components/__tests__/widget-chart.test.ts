import type { Root } from "react-dom/client";
import type { ReactElement } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AggregationType } from "@/generated/prisma";
import { ChartColor, DisplayType } from "@/features/widget/widget.schema";

const chartMocks = vi.hoisted(() => ({
  calls: [] as Array<{ chart: string; props: Record<string, unknown> }>,
  nextDynamicIndex: 0,
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const chart = ["vertical", "horizontal", "verticalWithLabels", "horizontalWithLabels", "doughnut", "radar"][
      chartMocks.nextDynamicIndex++
    ];

    return (props: Record<string, unknown>) => {
      chartMocks.calls.push({ chart, props });
      return null;
    };
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "Diagrams.noGroup") return "No group";
    return values ? `${key}(${JSON.stringify(values)})` : key;
  },
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumber: (value: number) => String(value),
    formatCurrency: (value: number) => `$${value}`,
  }),
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: () => "deals" }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("@/constants/chart-colors", () => {
  const palette = (prefix: string) => ({
    [ChartColor.primary1]: `${prefix}-primary1`,
    [ChartColor.primary2]: `${prefix}-primary2`,
    [ChartColor.secondary1]: `${prefix}-secondary1`,
    [ChartColor.danger2]: `${prefix}-danger2`,
    [ChartColor.success1]: `${prefix}-success1`,
  });

  return {
    getChartColors: () => palette("fill"),
    getChartStrokeColors: () => palette("stroke"),
    getChartTextColors: () => palette("text"),
  };
});

import { WidgetChart } from "../widget-chart";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
}

function renderChart(displayType: DisplayType, overrides: Partial<React.ComponentProps<typeof WidgetChart>> = {}) {
  chartMocks.calls.length = 0;
  mount(
    createElement(WidgetChart, {
      aggregationType: AggregationType.dealValue,
      data: [
        { labelKind: "system", systemLabelKey: "noGroup", optionColor: "success", value: 200 },
        { labelKind: "literal", label: "Hardware", value: 100 },
      ],
      displayOptions: {
        barColors: [ChartColor.danger2, ChartColor.secondary1],
        displayType,
        reverseXAxis: true,
        reverseYAxis: true,
        showFilters: true,
        showLegend: false,
        useGroupColors: true,
      },
      ...overrides,
    }),
  );

  expect(chartMocks.calls).toHaveLength(1);
  return chartMocks.calls[0];
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
});

describe("WidgetChart", () => {
  it.each([
    [DisplayType.verticalBarChart, "vertical"],
    [DisplayType.horizontalBarChart, "horizontal"],
    [DisplayType.verticalBarChartWithLabels, "verticalWithLabels"],
    [DisplayType.horizontalBarChartWithLabels, "horizontalWithLabels"],
    [DisplayType.doughnutChart, "doughnut"],
    [DisplayType.radarChart, "radar"],
  ])("renders %s through the expected chart implementation", (displayType, expectedChart) => {
    const call = renderChart(displayType);

    expect(call.chart).toBe(expectedChart);
    expect(call.props).toMatchObject({
      aggregationType: AggregationType.dealValue,
      reverseXAxis: true,
      reverseYAxis: true,
    });
  });

  it.each(Object.values(AggregationType))("forwards the %s aggregation to the chart", (aggregationType) => {
    const call = renderChart(DisplayType.verticalBarChart, { aggregationType });

    expect(call.props.aggregationType).toBe(aggregationType);
  });

  it("maps option colors, fallback colors, labels, and strokes into chart data", () => {
    const call = renderChart(DisplayType.verticalBarChart);

    expect(call.props.chartData).toEqual([
      {
        color: "fill-success1",
        fill: "fill-success1",
        label: "No group",
        labelColor: "text-success1",
        strokeColor: "stroke-success1",
        value: 200,
      },
      {
        color: "fill-secondary1",
        fill: "fill-secondary1",
        label: "Hardware",
        labelColor: "text-secondary1",
        strokeColor: "stroke-secondary1",
        value: 100,
      },
    ]);
    expect(call.props.colors).toEqual(["fill-success1", "fill-secondary1"]);
  });

  it("uses configured colors for every group when option colors are disabled", () => {
    const call = renderChart(DisplayType.verticalBarChart, {
      displayOptions: {
        barColors: [ChartColor.danger2, ChartColor.secondary1],
        displayType: DisplayType.verticalBarChart,
        useGroupColors: false,
      },
    });

    expect((call.props.chartData as Array<{ fill: string }>).map(({ fill }) => fill)).toEqual([
      "fill-danger2",
      "fill-secondary1",
    ]);
    expect(call.props.colors).toEqual(["fill-danger2", "fill-secondary1"]);
  });

  it("falls back to the primary color when a saved color list is empty", () => {
    const call = renderChart(DisplayType.verticalBarChart, {
      displayOptions: {
        barColors: [],
        displayType: DisplayType.verticalBarChart,
        useGroupColors: false,
      },
    });

    expect((call.props.chartData as Array<{ fill: string }>).map(({ fill }) => fill)).toEqual([
      "fill-primary1",
      "fill-primary1",
    ]);
    expect(call.props.colors).toEqual(["fill-primary1"]);
  });

  it("keeps legacy widgets without display options on the vertical primary-color default", () => {
    const call = renderChart(DisplayType.radarChart, { displayOptions: null });

    expect(call.chart).toBe("vertical");
    expect((call.props.chartData as Array<{ fill: string }>).map(({ fill }) => fill)).toEqual([
      "fill-success1",
      "fill-primary1",
    ]);
    expect(call.props.colors).toEqual(["fill-success1", "fill-primary1"]);
  });

  it("carries the per-group median through to the chart instead of dropping it", () => {
    const call = renderChart(DisplayType.verticalBarChart, {
      aggregationType: AggregationType.salesCycleDays,
      data: [
        { labelKind: "literal", label: "Enterprise", value: 21, metrics: { mean: 21, median: 14, sampleSize: 9 } },
        { labelKind: "literal", label: "SMB", value: 8 },
      ],
    });
    const notes = (call.props.chartData as Array<{ metricsNote?: string }>).map((point) => point.metricsNote);

    expect(notes[0]).toBe('Dashboard.widgetMetrics.median({"value":"14"})');
    expect(notes[1]).toBeUndefined();
  });

  it("carries the per-group closed-deal count through for a win rate", () => {
    const call = renderChart(DisplayType.horizontalBarChartWithLabels, {
      aggregationType: AggregationType.winRate,
      data: [
        {
          labelKind: "literal",
          label: "Enterprise",
          value: 75,
          metrics: { wonCount: 3, lostCount: 1, sampleSize: 4 },
        },
      ],
    });
    const notes = (call.props.chartData as Array<{ metricsNote?: string }>).map((point) => point.metricsNote);

    expect(notes[0]).toBe('Dashboard.widgetMetrics.winRateDenominator({"closed":"4","deals":"deals"})');
  });

  it("leaves the sum aggregations without a per-group note", () => {
    const call = renderChart(DisplayType.verticalBarChart);

    expect((call.props.chartData as Array<{ metricsNote?: string }>).every((point) => !point.metricsNote)).toBe(true);
  });

  it("passes the legend choice only to the doughnut chart", () => {
    const doughnut = renderChart(DisplayType.doughnutChart);
    const vertical = renderChart(DisplayType.verticalBarChart);

    expect(doughnut.props.showLegend).toBe(false);
    expect(vertical.props).not.toHaveProperty("showLegend");
  });
});
