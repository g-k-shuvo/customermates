import { describe, expect, it } from "vitest";

import { computeWeightedValue, effectiveProbability, readOptionWeights } from "../deal-weighting";

describe("readOptionWeights", () => {
  it("maps option values to their numeric weights", () => {
    const weights = readOptionWeights({
      options: [
        { value: "open", weight: 30 },
        { value: "won", weight: 100 },
        { value: "lost", weight: 0 },
      ],
    });

    expect([...weights.entries()]).toEqual([
      ["open", 30],
      ["won", 100],
      ["lost", 0],
    ]);
  });

  it("skips options that carry no weight so they stay unconfigured", () => {
    const weights = readOptionWeights({ options: [{ value: "open" }, { value: "won", weight: 100 }] });

    expect(weights.has("open")).toBe(false);
    expect(weights.get("won")).toBe(100);
  });

  it("skips options whose weight is not a finite number", () => {
    const weights = readOptionWeights({
      options: [
        { value: "a", weight: "30" },
        { value: "b", weight: Number.NaN },
        { value: "c", weight: Number.POSITIVE_INFINITY },
        { value: "d", weight: null },
      ],
    });

    expect(weights.size).toBe(0);
  });

  it("skips entries without a string value", () => {
    const weights = readOptionWeights({ options: [{ weight: 50 }, { value: 7, weight: 50 }] });

    expect(weights.size).toBe(0);
  });

  it("returns an empty map for shapes that are not a stored option list", () => {
    expect(readOptionWeights(null).size).toBe(0);
    expect(readOptionWeights(undefined).size).toBe(0);
    expect(readOptionWeights({}).size).toBe(0);
    expect(readOptionWeights({ options: null }).size).toBe(0);
    expect(readOptionWeights({ options: { currency: "eur" } }).size).toBe(0);
    expect(readOptionWeights([{ value: "open", weight: 30 }]).size).toBe(0);
  });
});

describe("computeWeightedValue", () => {
  it("discounts the total by the stage percentage", () => {
    expect(computeWeightedValue(50_000, 60)).toBe(30_000);
    expect(computeWeightedValue(342_000, 30)).toBe(102_600);
  });

  it("returns the full total at 100 percent", () => {
    expect(computeWeightedValue(212_000, 100)).toBe(212_000);
  });

  it("returns a measured zero for a zero-weight stage", () => {
    expect(computeWeightedValue(418_500, 0)).toBe(0);
  });

  it("returns null when the stage carries no weight, which is not a measured zero", () => {
    expect(computeWeightedValue(418_500, undefined)).toBeNull();
  });

  it("keeps a zero total at zero rather than null once a weight exists", () => {
    expect(computeWeightedValue(0, 60)).toBe(0);
  });
});

describe("effectiveProbability", () => {
  it("falls back to the stage probability when the deal carries no override", () => {
    expect(effectiveProbability(null, 40)).toBe(40);
    expect(effectiveProbability(undefined, 40)).toBe(40);
  });

  it("prefers the per-deal override over the stage", () => {
    expect(effectiveProbability(65, 40)).toBe(65);
  });

  it("treats a zero override as a deliberate zero, not as absent", () => {
    expect(effectiveProbability(0, 90)).toBe(0);
  });

  it("is undefined when neither the deal nor a stage sets one", () => {
    expect(effectiveProbability(null, null)).toBeUndefined();
    expect(effectiveProbability(undefined, undefined)).toBeUndefined();
  });

  it("ignores values that are not finite numbers", () => {
    expect(effectiveProbability(Number.NaN, 40)).toBe(40);
    expect(effectiveProbability(null, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe("forecast from stage probability", () => {
  const forecast = (totalValue: number, dealProbability: number | null, stageProbability: number | null) =>
    computeWeightedValue(totalValue, effectiveProbability(dealProbability, stageProbability));

  it("weights a deal by the probability of the stage it sits in", () => {
    expect(forecast(10_000, null, 40)).toBe(4000);
  });

  it("uses the per-deal override once the deal sets one", () => {
    expect(forecast(10_000, 65, 40)).toBe(6500);
  });

  it("follows the deal when it moves to a higher stage", () => {
    expect(forecast(10_000, null, 90)).toBe(9000);
  });

  it("has no forecast for a deal with neither a stage nor an override", () => {
    expect(forecast(10_000, null, null)).toBeNull();
  });
});
