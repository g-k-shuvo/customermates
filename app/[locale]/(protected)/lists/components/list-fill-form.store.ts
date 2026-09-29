import type { RootStore } from "@/core/stores/root.store";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, makeObservable, observable, toJS } from "mobx";
import { Resource } from "@/generated/prisma";

import { fillContactListAction, getContactFilterFieldsAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { filterRowsFor } from "@/components/data-view/filter-modal/filter-rows";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type ListFillForm = { searchTerm: string; filters: Filter[] };

const EMPTY: ListFillForm = { searchTerm: "", filters: [] };

export class ListFillFormStore extends BaseFormStore<ListFillForm> {
  filterableFields: FilterableField[] = [];
  customColumns: CustomColumnDto[] = [];
  private fieldsRequest: Promise<void> | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY, Resource.contacts);
    this.withUnsavedChangesGuard = false;

    makeObservable(this, {
      filterableFields: observable.ref,
      customColumns: observable.ref,
      applyFields: action,
    });
  }

  applyFields = (filterableFields: FilterableField[], customColumns: CustomColumnDto[]) => {
    this.filterableFields = filterableFields;
    this.customColumns = customColumns;
    this.form.filters = filterRowsFor(filterableFields, this.form.filters);
    this.savedState = { ...this.savedState, filters: filterRowsFor(filterableFields, []) };
  };

  loadFields = async () => {
    this.fieldsRequest ??= getContactFilterFieldsAction().then(({ filterableFields, customColumns }) =>
      this.applyFields(filterableFields, customColumns),
    );

    await this.fieldsRequest;
  };

  start = async (listId: string) => {
    this.setIsLoading(true);
    try {
      const result = await fillContactListAction({
        id: listId,
        filters: toJS(this.form.filters).filter(hasValidFilterConfiguration),
        searchTerm: this.form.searchTerm.trim() || null,
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return null;
      }

      return result.data;
    } finally {
      this.setIsLoading(false);
    }
  };
}
