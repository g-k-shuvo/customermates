import { describe, expect, it } from "vitest";

import { AggregationType } from "@/generated/prisma";

import { widgetHeadlineValue, widgetMetricNote, widgetPointMetricNote } from "../widget-metric-note";
import { widgetSubheader } from "../widget-subheader";

describe("widgetMetricNote", () => {
  it("asks the win-rate card to name the closed population behind the rate", () => {
    expect(
      widgetMetricNote(AggregationType.winRate, {
        headline: 62.5,
        median: null,
        sampleSize: 8,
      }),
    ).toEqual({
      kind: "winRateDenominator",
      sampleSize: 8,
    });
  });

  it("asks a duration card for the median beside the mean", () => {
    expect(
      widgetMetricNote(AggregationType.salesCycleDays, {
        headline: 39.8,
        median: 16,
        sampleSize: 10,
      }),
    ).toEqual({
      kind: "meanAndMedian",
      mean: 39.8,
      median: 16,
    });
  });

  it("leaves the ordinary sum aggregations without a note", () => {
    expect(widgetMetricNote(AggregationType.dealValue, null)).toBeNull();
  });
});

describe("widgetPointMetricNote", () => {
  it("gives a duration group the median that was computed for it", () => {
    expect(
      widgetPointMetricNote(AggregationType.stageDurationDays, {
        mean: 6,
        median: 5,
        sampleSize: 4,
      }),
    ).toEqual({
      kind: "meanAndMedian",
      mean: 6,
      median: 5,
    });
  });

  it("gives a win-rate group the closed deals behind its bar", () => {
    expect(
      widgetPointMetricNote(AggregationType.winRate, {
        wonCount: 3,
        lostCount: 1,
        sampleSize: 4,
      }),
    ).toEqual({
      kind: "winRateDenominator",
      sampleSize: 4,
    });
  });

  it("leaves a group without metrics unannotated", () => {
    expect(widgetPointMetricNote(AggregationType.salesCycleDays, undefined)).toBeNull();
  });

  it("leaves an ordinary sum group unannotated even when metrics ride along", () => {
    expect(
      widgetPointMetricNote(AggregationType.dealValue, {
        mean: 6,
        median: 5,
        sampleSize: 4,
      }),
    ).toBeNull();
  });
});

describe("widgetHeadlineValue", () => {
  it("sums the plotted points for a sum aggregation", () => {
    expect(widgetHeadlineValue(AggregationType.dealValue, null, 1200)).toBe(1200);
  });

  it("never sums win rates across groups, using the period rate instead", () => {
    expect(widgetHeadlineValue(AggregationType.winRate, { headline: 50, median: null, sampleSize: 8 }, 175)).toBe(50);
  });

  it("never sums stage durations across stages, using the overall mean instead", () => {
    expect(
      widgetHeadlineValue(AggregationType.stageDurationDays, { headline: 6, median: 5, sampleSize: 4 }, 45.8),
    ).toBe(6);
  });
});

describe("widgetSubheader with a metric note", () => {
  it("appends the note after the total and the group count", () => {
    expect(widgetSubheader(3, "50%", "groups", "8 closed deals, open deals excluded")).toBe(
      "50% · 3 groups · 8 closed deals, open deals excluded",
    );
  });

  it("appends the note even when there is only one group", () => {
    expect(widgetSubheader(1, "50%", "groups", "Median 16 days")).toBe("50% · Median 16 days");
  });

  it("still shows nothing when the widget has no data at all", () => {
    expect(widgetSubheader(0, "50%", "groups", "Median 16 days")).toBeNull();
  });
});
