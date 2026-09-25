import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";
import type { GroupCountRow } from "@/core/base/grouping/group-count";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";

import { describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { STAGE_GROUPING_FIELD, STAGE_GROUPING_KEY } from "../base-get.schema";
import { FilterOperatorKey } from "../base-query-builder";
import { stageGroupable } from "@/core/base/grouping/groupable-field";

type Item = { id: string };

const RENEWALS_PIPELINE_ID = "00000000-0000-4000-8000-000000000061";
const RENEWAL_STAGE_ID = "00000000-0000-4000-8000-000000000052";

class StubRepo extends BaseGetRepo<Item> {
  groupableFieldCalls: (readonly Filter[] | undefined)[] = [];

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

  getGroupableFields(
    _customColumns?: readonly CustomColumnDto[],
    filters?: readonly Filter[],
  ): Promise<GroupableFieldSpec[]> {
    this.groupableFieldCalls.push(filters);

    return Promise.resolve([
      stageGroupable({
        model: "deal",
        field: STAGE_GROUPING_KEY,
        column: STAGE_GROUPING_FIELD,
        labelKey: "Common.filters.fields.stageId",
        stages: [{ value: RENEWAL_STAGE_ID, label: "Renewal due" }],
      }),
    ]);
  }

  countByGroup(): Promise<GroupCountRow[]> {
    return Promise.resolve([{ key: RENEWAL_STAGE_ID, count: 0 }]);
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
}

class StubGetInteractor extends BaseGetInteractor<Item> {
  constructor(repo: StubRepo) {
    super(
      repo,
      { loadSurfaceState: vi.fn().mockResolvedValue({ activeViewKey: null, views: [], allState: {} }) },
      "interactive",
      EntityType.deal,
    );
  }
}

async function runGrouped(filters?: Filter[]) {
  const repo = new StubRepo();
  const params: GetQueryParams = { filters, grouping: { field: STAGE_GROUPING_KEY } };

  const result = await new StubGetInteractor(repo).invoke(params);

  return { repo, result };
}

describe("BaseGetInteractor stage grouping", () => {
  it("hands the validated request filters to the repository so it can pick the pipeline", async () => {
    const pipelineFilter: Filter = {
      field: "pipelineId",
      operator: FilterOperatorKey.equals,
      value: RENEWALS_PIPELINE_ID,
    };

    const { repo } = await runGrouped([pipelineFilter]);

    expect(repo.groupableFieldCalls).toEqual([[pipelineFilter]]);
  });

  it("still resolves the stage axis when no filter is set, and writes back by dragging", async () => {
    const { repo, result } = await runGrouped();

    expect(repo.groupableFieldCalls).toEqual([[]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.grouping?.kind).toBe("stage");
    expect(result.data.grouping?.supportsDragWriteBack).toBe(true);
    expect(result.data.grouping?.groups.map(({ key, label }) => [key, label])).toEqual([
      [RENEWAL_STAGE_ID, "Renewal due"],
    ]);
  });
});
