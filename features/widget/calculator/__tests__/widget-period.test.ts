import { describe, expect, it } from "vitest";

import { AggregationType } from "@/generated/prisma";

import { forecastWindow, funnelPeriodWindow, monthAlignedWindow, periodWindow } from "../widget-period";
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

describe("widget forecast window", () => {
  it("looks forward from now, so an expected close month covers deals that have not closed yet", () => {
    const window = forecastWindow(AggregationType.dealWeightedValue, 365, NOW);

    expect(window.from).toEqual(NOW);
    expect((window.to.getTime() - NOW.getTime()) / MILLISECONDS_PER_DAY).toBe(365);
  });

  it("falls back to ninety days when the widget carries no configured window", () => {
    const window = forecastWindow(AggregationType.dealValue, null, NOW);

    expect((window.to.getTime() - NOW.getTime()) / MILLISECONDS_PER_DAY).toBe(90);
  });

  it("never forecasts further ahead than the shared maximum", () => {
    const window = forecastWindow(AggregationType.dealValue, WIDGET_PERIOD_DAYS_MAX * 4, NOW);

    expect((window.to.getTime() - NOW.getTime()) / MILLISECONDS_PER_DAY).toBe(
      resolvePeriodDays(AggregationType.dealValue, WIDGET_PERIOD_DAYS_MAX * 4),
    );
  });
});

describe("calendar month alignment", () => {
  it("opens the window on the first instant of the month the period started in", () => {
    const aligned = monthAlignedWindow(periodWindow(AggregationType.winRate, 90, NOW));

    expect(aligned.from.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("closes the window on the first instant of the month after the period ended", () => {
    const aligned = monthAlignedWindow(periodWindow(AggregationType.winRate, 90, NOW));

    expect(aligned.to.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("shows a forecast every deal still open this month, not only the rest of today onward", () => {
    const aligned = monthAlignedWindow(forecastWindow(AggregationType.dealWeightedValue, 365, NOW));

    expect(aligned.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(aligned.from.getTime()).toBeLessThan(NOW.getTime());
    expect(aligned.to.toISOString()).toBe("2027-10-01T00:00:00.000Z");
  });

  it("leaves a window that already sits on month boundaries exactly where it is", () => {
    const window = { from: new Date("2026-01-01T00:00:00.000Z"), to: new Date("2026-04-01T00:00:00.000Z") };

    expect(monthAlignedWindow(window)).toEqual(window);
  });

  it("rolls a December end into the following January rather than into month thirteen", () => {
    const window = { from: new Date("2026-12-05T09:00:00.000Z"), to: new Date("2026-12-31T23:59:59.000Z") };
    const aligned = monthAlignedWindow(window);

    expect(aligned.from.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(aligned.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
