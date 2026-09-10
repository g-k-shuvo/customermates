import type { Filter } from "@/core/base/base-get.schema";

import { describe, expect, it } from "vitest";

import { DealStatus } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import {
  DEFAULT_DEAL_STATUS_FILTER,
  NO_NEXT_ACTIVITY_FILTER,
  PIPELINE_FILTER_FIELD,
  ROTTING_DEALS_FILTER,
  hasActiveDealQuery,
  isDefaultDealStatusFilter,
  isNoNextActivityFilterActive,
  isRottingFilterActive,
  pipelineFilter,
  selectedPipelineFilterId,
  shouldSeedDefaultDealStatusFilter,
  toggleNoNextActivityFilter,
  toggleRottingDealsFilter,
  withPipelineFilter,
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

describe("the neglected-deals chip", () => {
  it("asks for the deals with nothing on the calendar", () => {
    expect(NO_NEXT_ACTIVITY_FILTER).toEqual({
      field: FilterFieldKey.nextActivity,
      operator: FilterOperatorKey.in,
      value: ["false"],
    });
  });

  it("adds the clause and keeps every other filter", () => {
    expect(toggleNoNextActivityFilter([userFilter])).toEqual([userFilter, NO_NEXT_ACTIVITY_FILTER]);
  });

  it("removes the clause on a second press", () => {
    const withoutActivity = toggleNoNextActivityFilter([userFilter]);

    expect(isNoNextActivityFilterActive(withoutActivity)).toBe(true);
    expect(toggleNoNextActivityFilter(withoutActivity)).toEqual([userFilter]);
    expect(isNoNextActivityFilterActive([userFilter])).toBe(false);
  });

  it("replaces the opposite selection rather than stacking a contradictory second clause", () => {
    const scheduledOnly: Filter = {
      field: FilterFieldKey.nextActivity,
      operator: FilterOperatorKey.in,
      value: ["true"],
    };

    expect(isNoNextActivityFilterActive([scheduledOnly])).toBe(false);
    expect(toggleNoNextActivityFilter([scheduledOnly])).toEqual([NO_NEXT_ACTIVITY_FILTER]);
  });

  it("leaves the rotting chip untouched, so a manager can press both", () => {
    const both = toggleNoNextActivityFilter(toggleRottingDealsFilter([DEFAULT_DEAL_STATUS_FILTER]));

    expect(both).toEqual([DEFAULT_DEAL_STATUS_FILTER, ROTTING_DEALS_FILTER, NO_NEXT_ACTIVITY_FILTER]);
    expect(isRottingFilterActive(both)).toBe(true);
    expect(isNoNextActivityFilterActive(both)).toBe(true);
  });

  it("counts as an active query, so an empty result reaches the filtered empty state", () => {
    expect(hasActiveDealQuery({ filters: toggleNoNextActivityFilter([DEFAULT_DEAL_STATUS_FILTER]) })).toBe(true);
  });
});

describe("the pipeline switcher expressed as a filter", () => {
  const PIPELINE_ID = "10000000-0000-4000-8000-000000000001";
  const OTHER_PIPELINE_ID = "10000000-0000-4000-8000-000000000002";

  it("selects a pipeline with the field the deal repository already reads", () => {
    expect(pipelineFilter(PIPELINE_ID)).toEqual({
      field: PIPELINE_FILTER_FIELD,
      operator: FilterOperatorKey.in,
      value: [PIPELINE_ID],
    });
  });

  it("reads the selection back so the URL and stored personalization drive the switcher", () => {
    expect(selectedPipelineFilterId(undefined)).toBeNull();
    expect(selectedPipelineFilterId([userFilter])).toBeNull();
    expect(selectedPipelineFilterId([userFilter, pipelineFilter(PIPELINE_ID)])).toBe(PIPELINE_ID);
  });

  it("ignores a multi-valued pipeline clause, exactly as the repository does", () => {
    const both: Filter = {
      field: PIPELINE_FILTER_FIELD,
      operator: FilterOperatorKey.in,
      value: [PIPELINE_ID, OTHER_PIPELINE_ID],
    };

    expect(selectedPipelineFilterId([both])).toBeNull();
  });

  it("replaces the previous pipeline rather than stacking a second clause", () => {
    const first = withPipelineFilter([userFilter], PIPELINE_ID);

    expect(first).toEqual([userFilter, pipelineFilter(PIPELINE_ID)]);
    expect(withPipelineFilter(first, OTHER_PIPELINE_ID)).toEqual([userFilter, pipelineFilter(OTHER_PIPELINE_ID)]);
  });

  it("drops the clause when every pipeline is asked for, keeping the other filters", () => {
    const applied = withPipelineFilter([DEFAULT_DEAL_STATUS_FILTER], PIPELINE_ID);

    expect(withPipelineFilter(applied, null)).toEqual([DEFAULT_DEAL_STATUS_FILTER]);
  });

  it("counts as an active query, so an empty pipeline reaches the filtered empty state", () => {
    expect(hasActiveDealQuery({ filters: withPipelineFilter([DEFAULT_DEAL_STATUS_FILTER], PIPELINE_ID) })).toBe(true);
  });
});
