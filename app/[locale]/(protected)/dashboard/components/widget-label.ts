import type { DiagramDataPoint } from "@/features/widget/widget.schema";

const UUID_LABEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function monthStartDate(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(year, monthNumber - 1, 1);
}

export function widgetDataPointLabel(
  item: DiagramDataPoint,
  translate: (key: string) => string,
  formatMonth?: (date: Date) => string,
): string {
  if (item.labelKind === "system") return translate(`Diagrams.${item.systemLabelKey}`);
  if (item.labelKind === "month") return formatMonth?.(monthStartDate(item.month)) || item.month;
  return UUID_LABEL.test(item.label) ? translate("Common.inputs.unavailableSelection") : item.label;
}
