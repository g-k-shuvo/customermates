import { describe, expect, it } from "vitest";

import { closedDealTotals, meanOf, medianOf, winRatePercent } from "../widget-metrics";

const SKEWED_SALES_CYCLE_DAYS = [8, 11, 12, 14, 15, 17, 21, 26, 34, 240];

describe("winRatePercent denominator", () => {
  it("divides won by won plus lost, so open deals never reach the denominator", () => {
    expect(winRatePercent(3, 1)).toBe(75);
  });

  it("is a different number from the one you get by counting open deals as not-won", () => {
    const wonCount = 3;
    const lostCount = 1;
    const openCount = 12;

    expect(winRatePercent(wonCount, lostCount)).toBe(75);
    expect(winRatePercent(wonCount, lostCount + openCount)).toBe(18.75);
  });

  it("has no rate at all when nothing closed in the period", () => {
    expect(winRatePercent(0, 0)).toBeNull();
  });

  it("reports a total loss as zero rather than as missing data", () => {
    expect(winRatePercent(0, 5)).toBe(0);
  });

  it("sums the closed counts and values across grouped points", () => {
    expect(
      closedDealTotals([
        { labelKind: "literal", label: "Qualified", value: 60, metrics: { wonCount: 3, lostCount: 2, wonValue: 300 } },
        { labelKind: "literal", label: "Proposal", value: 25, metrics: { wonCount: 1, lostCount: 3, lostValue: 400 } },
        { labelKind: "literal", label: "Untracked", value: 0 },
      ]),
    ).toEqual({ wonCount: 4, lostCount: 5, wonValue: 300, lostValue: 400 });
  });
});

describe("mean versus median on a skewed sample", () => {
  it("lets one very long deal drag the mean far above the median", () => {
    expect(meanOf(SKEWED_SALES_CYCLE_DAYS)).toBe(39.8);
    expect(medianOf(SKEWED_SALES_CYCLE_DAYS)).toBe(16);
  });

  it("keeps the median stable when the outlier grows further", () => {
    const worse = [...SKEWED_SALES_CYCLE_DAYS.slice(0, -1), 2400];

    expect(meanOf(worse)).toBeGreaterThan(200);
    expect(medianOf(worse)).toBe(16);
  });

  it("averages the two middle values for an even sample and picks the middle one for an odd sample", () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
    expect(medianOf([1, 2, 3])).toBe(2);
  });

  it("does not depend on the order the sample arrives in", () => {
    expect(medianOf([240, 8, 15, 17, 11])).toBe(15);
  });

  it("has no mean and no median for an empty sample", () => {
    expect(meanOf([])).toBeNull();
    expect(medianOf([])).toBeNull();
  });
});
