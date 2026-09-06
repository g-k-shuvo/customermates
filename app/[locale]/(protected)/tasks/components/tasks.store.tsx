import type { TaskDto } from "@/features/tasks/task.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { TableColumn } from "@/core/base/base-data-view.store";

import { action, makeObservable, observable } from "mobx";
import { EntityType, Resource, TaskType } from "@/generated/prisma";

import { getTasksAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export const TASKS_PAGE_TABS = ["list", "agenda"] as const;

export type TasksPageTab = (typeof TASKS_PAGE_TABS)[number];

export class TasksStore extends BaseDataViewStore<TaskDto> {
  activeTab: TasksPageTab = "list";

  constructor(rootStore: RootStore) {
    super(rootStore, Resource.tasks, EntityType.task);

    makeObservable(this, {
      activeTab: observable,
      setActiveTab: action,
    });
  }

  setActiveTab = (tab: TasksPageTab) => {
    if (this.activeTab === tab) return;

    this.activeTab = tab;

    if (tab === "agenda") this.setQueryOptions({ sortDescriptor: { field: "dueAt", direction: "asc" } });
  };

  isItemSelectable(item: TaskDto): boolean {
    return item.type === TaskType.custom;
  }

  get canAccessContacts() {
    return this.rootStore.userStore.canAccess(Resource.contacts);
  }

  get canAccessOrganizations() {
    return this.rootStore.userStore.canAccess(Resource.organizations);
  }

  get canAccessDeals() {
    return this.rootStore.userStore.canAccess(Resource.deals);
  }

  get canAccessServices() {
    return this.rootStore.userStore.canAccess(Resource.services);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "name", sortable: true },
      { uid: "activityKind" },
      { uid: "dueAt", sortable: true },
      { uid: "completedAt", sortable: true },
      this.canAccessContacts && { uid: "contacts" },
      this.canAccessOrganizations && { uid: "organizations" },
      this.canAccessDeals && { uid: "deals" },
      this.canAccessServices && { uid: "services" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getTasksAction(params);
  }
}
