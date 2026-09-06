"use client";

import type { ChartDataPoint } from "./chart.types";
import { isCurrencyAggregation } from "@/features/widget/widget-aggregation";

import { Bar, BarChart, LabelList, XAxis, YAxis, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import type { AggregationType } from "@/generated/prisma";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

const CHAR_WIDTH = 7;
const LABEL_PADDING_LEFT = 4;
const LABEL_PADDING_RIGHT = 4;
const VALUE_MARGIN_MIN = 56;
const VALUE_MARGIN_MAX = 140;

function truncateToWidth(text: string, maxWidth: number) {
  if (maxWidth <= CHAR_WIDTH) return "…";
  const maxChars = Math.max(1, Math.floor(maxWidth / CHAR_WIDTH));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export const HorizontalBarChartWithLabels = observer(
  ({ aggregationType, chartData, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const intlStore = useHydratedIntlStore();

    const formatValue = (value: number) =>
      isCurrencyAggregation(aggregationType) ? intlStore.formatCurrency(value) : intlStore.formatNumber(value);

    const widestValueLabel = chartData.reduce((widest, point) => {
      const noteWidth = point.metricsNote ? point.metricsNote.length * CHAR_WIDTH : 0;
      return Math.max(widest, formatValue(point.value).length * CHAR_WIDTH, noteWidth);
    }, 0);

    const valueMargin = Math.min(Math.max(widestValueLabel + 12, VALUE_MARGIN_MIN), VALUE_MARGIN_MAX);
    const right = reverseXAxis ? 0 : valueMargin;
    const left = reverseXAxis ? valueMargin : 0;

    return (
      <DashboardChartContainer>
        <BarChart data={chartData} layout="vertical" margin={{ right, left }}>
          <XAxis
            hide
            domain={[0, "dataMax"]}
            padding={{ right: 1, left: 1 }}
            reversed={Boolean(reverseXAxis)}
            type="number"
          />

          <YAxis hide dataKey="label" reversed={Boolean(reverseYAxis)} type="category" />

          <ChartTooltip aggregationType={aggregationType} />

          <Bar dataKey="value" radius={4}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
            ))}

            <LabelList
              content={(props) => {
                const { x, y, height, width, value, index } = props;
                const entry = chartData[index as number];
                if (!entry) return null;
                const text = String(value ?? "");
                const available = Number(width) - LABEL_PADDING_LEFT - LABEL_PADDING_RIGHT;
                const display = truncateToWidth(text, available);
                return (
                  <text
                    dominantBaseline="middle"
                    fill={entry.labelColor}
                    fontSize={12}
                    textAnchor="start"
                    x={Number(x) + LABEL_PADDING_LEFT}
                    y={Number(y) + Number(height) / 2 + 1}
                  >
                    <title>{text}</title>

                    {display}
                  </text>
                );
              }}
              dataKey="label"
            />

            <LabelList
              content={(props) => {
                const { x, y, width, height, value, index } = props;
                const entry = chartData[index as number];
                if (!entry) return null;
                const start = Number(x) + Number(width) + LABEL_PADDING_LEFT;
                const middle = Number(y) + Number(height) / 2 + 1;
                const numValue = typeof value === "number" ? value : Number(value) || 0;
                return (
                  <text
                    dominantBaseline="middle"
                    fill={textColor}
                    fontSize={12}
                    textAnchor="start"
                    x={start}
                    y={entry.metricsNote ? middle - 7 : middle}
                  >
                    <tspan x={start}>{formatValue(numValue)}</tspan>

                    {entry.metricsNote && (
                      <tspan dy={13} fontSize={10} x={start}>
                        {entry.metricsNote}
                      </tspan>
                    )}
                  </text>
                );
              }}
              dataKey="value"
            />
          </Bar>
        </BarChart>
      </DashboardChartContainer>
    );
  },
);
