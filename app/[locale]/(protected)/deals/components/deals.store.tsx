import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { DealDto } from "@/features/deals/deal.schema";

import { action, makeObservable, observable } from "mobx";

import { EntityType, Resource } from "@/generated/prisma";

import { getDealsAction } from "../actions";

import {
  DEAL_STATUS_FILTER_FIELD,
  DEFAULT_DEAL_STATUS_FILTER,
  shouldSeedDefaultDealStatusFilter,
} from "./deal-board-filters";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export type DealStageOption = { id: string; name: string; probability: number };

export class DealsStore extends BaseDataViewStore<DealDto> {
  stages: DealStageOption[] = [];
  hasSeededDefaultStatusFilter = false;

  constructor(rootStore: RootStore) {
    super(rootStore, Resource.deals, EntityType.deal);

    makeObservable(this, {
      stages: observable,
      hasSeededDefaultStatusFilter: observable,
      setStages: action,
      seedDefaultStatusFilter: action,
    });
  }

  setStages = (stages: DealStageOption[]) => {
    this.stages = stages;
  };

  seedDefaultStatusFilter = () => {
    if (this.hasSeededDefaultStatusFilter) return;
    this.hasSeededDefaultStatusFilter = true;

    if (!this.isReady) return;
    if (!this.filterableFields.some((field) => field.field === DEAL_STATUS_FILTER_FIELD)) return;
    if (!shouldSeedDefaultDealStatusFilter({ filters: this.filters, searchTerm: this.searchTerm })) return;

    this.setQueryOptions({ filters: [DEFAULT_DEAL_STATUS_FILTER] });
  };

  get canAccessOrganizations() {
    return this.rootStore.userStore.canAccess(Resource.organizations);
  }

  get canAccessContacts() {
    return this.rootStore.userStore.canAccess(Resource.contacts);
  }

  get canAccessServices() {
    return this.rootStore.userStore.canAccess(Resource.services);
  }

  get canAccessTasks() {
    return this.rootStore.userStore.canAccess(Resource.tasks);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "name", sortable: true },
      { uid: "status" },
      { uid: "rottingAt", sortable: true },
      { uid: "totalValue", sortable: true },
      { uid: "weightedValue", sortable: true },
      { uid: "totalQuantity", sortable: true },
      this.canAccessContacts && { uid: "contacts" },
      this.canAccessOrganizations && { uid: "organizations" },
      this.canAccessServices && { uid: "services" },
      this.canAccessTasks && { uid: "tasks" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getDealsAction(params);
  }
}
