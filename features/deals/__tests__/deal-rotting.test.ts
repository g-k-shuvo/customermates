import { describe, expect, it } from "vitest";

import { DealStatus } from "@/generated/prisma";

import { computeRottingAt, isRotting } from "../deal-rotting";

const STAGE_ENTERED_AT = new Date("2026-03-01T09:00:00.000Z");

describe("computeRottingAt", () => {
  it("stamps the deadline rottingDays after the deal entered the stage", () => {
    expect(computeRottingAt(DealStatus.open, STAGE_ENTERED_AT, 14)).toEqual(new Date("2026-03-15T09:00:00.000Z"));
  });

  it("leaves a stage that sets no rotting window unable to rot", () => {
    expect(computeRottingAt(DealStatus.open, STAGE_ENTERED_AT, null)).toBeNull();
    expect(computeRottingAt(DealStatus.open, STAGE_ENTERED_AT, undefined)).toBeNull();
  });

  it("leaves a deal that never recorded a stage entry unable to rot", () => {
    expect(computeRottingAt(DealStatus.open, null, 14)).toBeNull();
    expect(computeRottingAt(DealStatus.open, undefined, 14)).toBeNull();
  });

  it("leaves a closed deal unable to rot whatever its stage says", () => {
    expect(computeRottingAt(DealStatus.won, STAGE_ENTERED_AT, 14)).toBeNull();
    expect(computeRottingAt(DealStatus.lost, STAGE_ENTERED_AT, 14)).toBeNull();
  });

  it("treats a zero, negative or non-finite window as no window at all", () => {
    expect(computeRottingAt(DealStatus.open, STAGE_ENTERED_AT, 0)).toBeNull();
    expect(computeRottingAt(DealStatus.open, STAGE_ENTERED_AT, -3)).toBeNull();
    expect(computeRottingAt(DealStatus.open, STAGE_ENTERED_AT, Number.NaN)).toBeNull();
    expect(computeRottingAt(DealStatus.open, STAGE_ENTERED_AT, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("isRotting", () => {
  const rottingAt = new Date("2026-03-15T09:00:00.000Z");

  it("counts a deal as rotting exactly at the threshold", () => {
    expect(isRotting(rottingAt, new Date("2026-03-15T09:00:00.000Z"))).toBe(true);
  });

  it("does not count a deal as rotting one millisecond before the threshold", () => {
    expect(isRotting(rottingAt, new Date("2026-03-15T08:59:59.999Z"))).toBe(false);
  });

  it("counts a deal as rotting past the threshold", () => {
    expect(isRotting(rottingAt, new Date("2026-03-16T09:00:00.000Z"))).toBe(true);
  });

  it("never counts a deal with no deadline as rotting", () => {
    expect(isRotting(null, new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
    expect(isRotting(undefined, new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
  });
});
