import type { Filter } from "@/core/base/base-get.schema";

import { describe, expect, it } from "vitest";

import { DealStatus } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import {
  DEFAULT_DEAL_STATUS_FILTER,
  ROTTING_DEALS_FILTER,
  hasActiveDealQuery,
  isDefaultDealStatusFilter,
  isRottingFilterActive,
  shouldSeedDefaultDealStatusFilter,
  toggleRottingDealsFilter,
} from "../deal-board-filters";

const userFilter: Filter = {
  field: FilterFieldKey.userIds,
  operator: FilterOperatorKey.in,
  value: ["user-1"],
};

describe("the seeded board default", () => {
  it("filters the board down to open records", () => {
    expect(DEFAULT_DEAL_STATUS_FILTER).toEqual({
      field: FilterFieldKey.dealStatus,
      operator: FilterOperatorKey.in,
      value: [DealStatus.open],
    });
  });

  it("is seeded only when nothing else is asked for", () => {
    expect(shouldSeedDefaultDealStatusFilter({})).toBe(true);
    expect(shouldSeedDefaultDealStatusFilter({ filters: [], searchTerm: "   " })).toBe(true);
    expect(shouldSeedDefaultDealStatusFilter({ filters: [userFilter] })).toBe(false);
    expect(shouldSeedDefaultDealStatusFilter({ searchTerm: "acme" })).toBe(false);
  });

  it("recognises only the exact seeded chip", () => {
    expect(isDefaultDealStatusFilter(DEFAULT_DEAL_STATUS_FILTER)).toBe(true);
    expect(
      isDefaultDealStatusFilter({
        field: FilterFieldKey.dealStatus,
        operator: FilterOperatorKey.in,
        value: [DealStatus.open, DealStatus.won],
      }),
    ).toBe(false);
    expect(
      isDefaultDealStatusFilter({
        field: FilterFieldKey.dealStatus,
        operator: FilterOperatorKey.notIn,
        value: [DealStatus.open],
      }),
    ).toBe(false);
    expect(isDefaultDealStatusFilter(userFilter)).toBe(false);
  });
});

describe("hasActiveDealQuery", () => {
  it("stays false while only the seeded chip is applied, so the board keeps its first-run empty state", () => {
    expect(hasActiveDealQuery({})).toBe(false);
    expect(hasActiveDealQuery({ filters: [DEFAULT_DEAL_STATUS_FILTER] })).toBe(false);
  });

  it("turns true as soon as the reader asks for anything else", () => {
    expect(hasActiveDealQuery({ filters: [DEFAULT_DEAL_STATUS_FILTER, userFilter] })).toBe(true);
    expect(hasActiveDealQuery({ filters: [DEFAULT_DEAL_STATUS_FILTER], searchTerm: "acme" })).toBe(true);
    expect(
      hasActiveDealQuery({
        filters: [{ field: FilterFieldKey.dealStatus, operator: FilterOperatorKey.in, value: [DealStatus.won] }],
      }),
    ).toBe(true);
  });
});

describe("the rotting chip", () => {
  it("adds the rotting clause and keeps every other filter", () => {
    expect(toggleRottingDealsFilter([userFilter])).toEqual([userFilter, ROTTING_DEALS_FILTER]);
  });

  it("removes the rotting clause on a second press", () => {
    const withRotting = toggleRottingDealsFilter([userFilter]);

    expect(isRottingFilterActive(withRotting)).toBe(true);
    expect(toggleRottingDealsFilter(withRotting)).toEqual([userFilter]);
    expect(isRottingFilterActive([userFilter])).toBe(false);
  });

  it("replaces a healthy-only rotting clause rather than stacking a second one", () => {
    const healthyOnly: Filter = {
      field: FilterFieldKey.rotting,
      operator: FilterOperatorKey.in,
      value: ["false"],
    };

    expect(isRottingFilterActive([healthyOnly])).toBe(false);
    expect(toggleRottingDealsFilter([healthyOnly])).toEqual([ROTTING_DEALS_FILTER]);
  });
});
