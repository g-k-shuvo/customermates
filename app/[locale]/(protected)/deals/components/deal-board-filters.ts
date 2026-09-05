import type { Filter } from "@/core/base/base-get.schema";

import { DealStatus } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

export const ROTTING_FILTER_TRUE = "true";

export const DEAL_STATUS_FILTER_FIELD: string = FilterFieldKey.dealStatus;

export const ROTTING_FILTER_FIELD: string = FilterFieldKey.rotting;

export const DEFAULT_DEAL_STATUS_FILTER: Filter = {
  field: FilterFieldKey.dealStatus,
  operator: FilterOperatorKey.in,
  value: [DealStatus.open],
};

export const ROTTING_DEALS_FILTER: Filter = {
  field: FilterFieldKey.rotting,
  operator: FilterOperatorKey.in,
  value: [ROTTING_FILTER_TRUE],
};

export type DealBoardQueryState = {
  filters?: Filter[];
  searchTerm?: string;
};

function singleValue(filter: Filter): string | undefined {
  const value = "value" in filter ? filter.value : undefined;
  if (!Array.isArray(value) || value.length !== 1) return undefined;

  return value[0];
}

export function isDefaultDealStatusFilter(filter: Filter): boolean {
  if (filter.field !== DEAL_STATUS_FILTER_FIELD) return false;
  if (filter.operator !== FilterOperatorKey.in) return false;

  return singleValue(filter) === DealStatus.open;
}

export function isRottingDealsFilter(filter: Filter): boolean {
  if (filter.field !== ROTTING_FILTER_FIELD) return false;
  if (filter.operator !== FilterOperatorKey.in) return false;

  return singleValue(filter) === ROTTING_FILTER_TRUE;
}

export function isRottingFilterActive(filters: Filter[] | undefined): boolean {
  return (filters ?? []).some(isRottingDealsFilter);
}

export function toggleRottingDealsFilter(filters: Filter[] | undefined): Filter[] {
  const current = filters ?? [];
  const wasActive = isRottingFilterActive(current);
  const withoutRotting = current.filter((filter) => filter.field !== ROTTING_FILTER_FIELD);

  return wasActive ? withoutRotting : [...withoutRotting, ROTTING_DEALS_FILTER];
}

export function shouldSeedDefaultDealStatusFilter(state: DealBoardQueryState): boolean {
  if ((state.filters ?? []).length > 0) return false;

  return !state.searchTerm?.trim();
}

export function hasActiveDealQuery(state: DealBoardQueryState): boolean {
  if (state.searchTerm?.trim()) return true;

  return (state.filters ?? []).some((filter) => !isDefaultDealStatusFilter(filter));
}
