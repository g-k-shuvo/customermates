import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, GroupOption, SortDescriptor } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { STAGE_GROUPING_KEY } from "../base-get.schema";
import { FilterOperatorKey } from "../base-query-builder";

type Item = { id: string };

const RENEWALS_PIPELINE_ID = "00000000-0000-4000-8000-000000000061";
const RENEWAL_STAGE_ID = "00000000-0000-4000-8000-000000000052";

class StubRepo extends BaseGetRepo<Item> {
  groupOptionCalls: (Filter[] | undefined)[] = [];

  getItems(): Promise<Item[]> {
    return Promise.resolve([]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(0);
  }

  getSortableFields() {
    return [];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([{ field: "pipelineId", operators: [FilterOperatorKey.equals] }]);
  }

  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve([]);
  }

  validateFilters(args: { filters: Filter[] | undefined }): Filter[] {
    return args.filters ?? [];
  }

  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }

  sumNumericFields<F extends string>(): Promise<Partial<Record<F, number | null>>> {
    return Promise.resolve({});
  }

  getGroupOptions(filters?: Filter[]): Promise<GroupOption[]> {
    this.groupOptionCalls.push(filters);

    return Promise.resolve([{ value: RENEWAL_STAGE_ID, label: "Renewal due" }]);
  }
}

class StubGetInteractor extends BaseGetInteractor<Item> {
  constructor(repo: StubRepo) {
    super(repo, { getP13n: vi.fn(), upsertP13n: vi.fn() }, "interactive", EntityType.deal);
  }
}

async function runGrouped(filters?: Filter[]) {
  const repo = new StubRepo();
  const params: GetQueryParams = {
    filters,
    groupedPagination: { groupingColumnId: STAGE_GROUPING_KEY, perGroup: 5 },
  };

  const result = await new StubGetInteractor(repo).invoke(params);

  return { repo, result };
}

describe("BaseGetInteractor stage group options", () => {
  it("hands the validated request filters to the repository", async () => {
    const pipelineFilter: Filter = {
      field: "pipelineId",
      operator: FilterOperatorKey.equals,
      value: RENEWALS_PIPELINE_ID,
    };

    const { repo } = await runGrouped([pipelineFilter]);

    expect(repo.groupOptionCalls).toEqual([[pipelineFilter]]);
  });

  it("still resolves group options when no filter is set", async () => {
    const { repo, result } = await runGrouped();

    expect(repo.groupOptionCalls).toEqual([[]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.groupOptions).toEqual([{ value: RENEWAL_STAGE_ID, label: "Renewal due" }]);
  });
});
