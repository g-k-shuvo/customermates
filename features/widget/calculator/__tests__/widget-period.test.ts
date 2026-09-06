import { describe, expect, it } from "vitest";

import { AggregationType } from "@/generated/prisma";

import { funnelPeriodWindow, periodWindow } from "../widget-period";
import { WIDGET_PERIOD_DAYS_MAX, resolvePeriodDays } from "../../widget-aggregation";

const NOW = new Date("2026-09-06T12:00:00.000Z");
const MILLISECONDS_PER_DAY = 86_400_000;

describe("widget period window", () => {
  it("bounds an unconfigured win rate to the last ninety days", () => {
    const window = periodWindow(AggregationType.winRate, null, NOW);

    expect(window.to).toEqual(NOW);
    expect((NOW.getTime() - window.from.getTime()) / MILLISECONDS_PER_DAY).toBe(90);
  });

  it("bounds an unconfigured sales cycle to the last twelve months", () => {
    const window = periodWindow(AggregationType.salesCycleDays, undefined, NOW);

    expect((NOW.getTime() - window.from.getTime()) / MILLISECONDS_PER_DAY).toBe(365);
  });

  it("uses the configured window when the widget carries one", () => {
    const window = periodWindow(AggregationType.stageDurationDays, 30, NOW);

    expect((NOW.getTime() - window.from.getTime()) / MILLISECONDS_PER_DAY).toBe(30);
  });

  it("never leaves a query unbounded, however the period is configured", () => {
    for (const periodDays of [null, undefined, 0, -5, 10_000]) {
      const window = periodWindow(AggregationType.winRate, periodDays, NOW);
      const days = (NOW.getTime() - window.from.getTime()) / MILLISECONDS_PER_DAY;

      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(WIDGET_PERIOD_DAYS_MAX);
    }
  });

  it("caps an oversized period rather than widening the scan", () => {
    expect(resolvePeriodDays(AggregationType.winRate, 100_000)).toBe(WIDGET_PERIOD_DAYS_MAX);
  });
});

describe("funnel period window", () => {
  it("bounds an unconfigured funnel to the last ninety days", () => {
    const window = funnelPeriodWindow(null, NOW);

    expect(window.to).toEqual(NOW);
    expect((NOW.getTime() - window.from.getTime()) / MILLISECONDS_PER_DAY).toBe(90);
  });

  it("uses the configured funnel window when the widget carries one", () => {
    expect((NOW.getTime() - funnelPeriodWindow(365, NOW).from.getTime()) / MILLISECONDS_PER_DAY).toBe(365);
  });

  it("never leaves the stage-history scan unbounded", () => {
    for (const periodDays of [null, undefined, 0, -5, 10_000]) {
      const days = (NOW.getTime() - funnelPeriodWindow(periodDays, NOW).from.getTime()) / MILLISECONDS_PER_DAY;

      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(WIDGET_PERIOD_DAYS_MAX);
    }
  });
});
