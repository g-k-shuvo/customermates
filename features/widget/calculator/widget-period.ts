import type { PeriodWindow } from "./widget-calculator.types";
import type { AggregationType } from "@/generated/prisma";

import { resolveFunnelPeriodDays, resolvePeriodDays } from "../widget-aggregation";

const MILLISECONDS_PER_DAY = 86_400_000;

function windowEndingNow(days: number, now: Date): PeriodWindow {
  return { from: new Date(now.getTime() - days * MILLISECONDS_PER_DAY), to: now };
}

export function periodWindow(
  aggregationType: AggregationType,
  periodDays: number | null | undefined,
  now: Date,
): PeriodWindow {
  return windowEndingNow(resolvePeriodDays(aggregationType, periodDays), now);
}

export function funnelPeriodWindow(periodDays: number | null | undefined, now: Date): PeriodWindow {
  return windowEndingNow(resolveFunnelPeriodDays(periodDays), now);
}

export function forecastWindow(
  aggregationType: AggregationType,
  periodDays: number | null | undefined,
  now: Date,
): PeriodWindow {
  const days = resolvePeriodDays(aggregationType, periodDays);

  return { from: now, to: new Date(now.getTime() + days * MILLISECONDS_PER_DAY) };
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function monthAlignedWindow(window: PeriodWindow): PeriodWindow {
  const from = startOfUtcMonth(window.from);
  const lastMonth = startOfUtcMonth(window.to);
  const to =
    lastMonth.getTime() === window.to.getTime()
      ? lastMonth
      : new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 1));

  return { from, to };
}
