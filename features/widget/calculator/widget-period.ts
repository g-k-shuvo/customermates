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
