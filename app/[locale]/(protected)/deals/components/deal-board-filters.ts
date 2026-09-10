import type { Filter } from "@/core/base/base-get.schema";

import { DealStatus } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

export const ROTTING_FILTER_TRUE = "true";

export const DEAL_STATUS_FILTER_FIELD: string = FilterFieldKey.dealStatus;

export const ROTTING_FILTER_FIELD: string = FilterFieldKey.rotting;

export const NEXT_ACTIVITY_FILTER_NONE = "false";

export const NEXT_ACTIVITY_FILTER_FIELD: string = FilterFieldKey.nextActivity;

export const PIPELINE_FILTER_FIELD: string = FilterFieldKey.pipelineId;

const PIPELINE_SELECTION_OPERATORS: string[] = [FilterOperatorKey.equals, FilterOperatorKey.in];

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

export const NO_NEXT_ACTIVITY_FILTER: Filter = {
  field: FilterFieldKey.nextActivity,
  operator: FilterOperatorKey.in,
  value: [NEXT_ACTIVITY_FILTER_NONE],
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

function onlySelectedValue(filter: Filter): string | undefined {
  const value = "value" in filter ? filter.value : undefined;
  if (typeof value === "string") return value;

  return singleValue(filter);
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

export function isNoNextActivityFilter(filter: Filter): boolean {
  if (filter.field !== NEXT_ACTIVITY_FILTER_FIELD) return false;
  if (filter.operator !== FilterOperatorKey.in) return false;

  return singleValue(filter) === NEXT_ACTIVITY_FILTER_NONE;
}

export function isNoNextActivityFilterActive(filters: Filter[] | undefined): boolean {
  return (filters ?? []).some(isNoNextActivityFilter);
}

export function toggleNoNextActivityFilter(filters: Filter[] | undefined): Filter[] {
  const current = filters ?? [];
  const wasActive = isNoNextActivityFilterActive(current);
  const withoutNextActivity = current.filter((filter) => filter.field !== NEXT_ACTIVITY_FILTER_FIELD);

  return wasActive ? withoutNextActivity : [...withoutNextActivity, NO_NEXT_ACTIVITY_FILTER];
}

export function pipelineFilter(pipelineId: string): Filter {
  return { field: PIPELINE_FILTER_FIELD, operator: FilterOperatorKey.in, value: [pipelineId] };
}

export function selectedPipelineFilterId(filters: Filter[] | undefined): string | null {
  for (const filter of filters ?? []) {
    if (filter.field !== PIPELINE_FILTER_FIELD) continue;
    if (!PIPELINE_SELECTION_OPERATORS.includes(filter.operator)) continue;

    const value = onlySelectedValue(filter);
    if (value !== undefined) return value;
  }

  return null;
}

export function withPipelineFilter(filters: Filter[] | undefined, pipelineId: string | null): Filter[] {
  const withoutPipeline = (filters ?? []).filter((filter) => filter.field !== PIPELINE_FILTER_FIELD);

  return pipelineId === null ? withoutPipeline : [...withoutPipeline, pipelineFilter(pipelineId)];
}

export function shouldSeedDefaultDealStatusFilter(state: DealBoardQueryState): boolean {
  if ((state.filters ?? []).length > 0) return false;

  return !state.searchTerm?.trim();
}

export function hasActiveDealQuery(state: DealBoardQueryState): boolean {
  if (state.searchTerm?.trim()) return true;

  return (state.filters ?? []).some((filter) => !isDefaultDealStatusFilter(filter));
}
