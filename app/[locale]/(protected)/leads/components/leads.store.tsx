import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { LeadDto } from "@/features/leads/lead.schema";

import { EntityType, Resource } from "@/generated/prisma";

import { getLeadsAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class LeadsStore extends BaseDataViewStore<LeadDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.leads, EntityType.lead);
  }

  get canAccessContacts() {
    return this.rootStore.userStore.canAccess(Resource.contacts);
  }

  get canAccessOrganizations() {
    return this.rootStore.userStore.canAccess(Resource.organizations);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "title", sortable: true },
      { uid: "status", sortable: true },
      this.canAccessContacts && { uid: "contact" },
      this.canAccessOrganizations && { uid: "organization" },
      { uid: "source" },
      { uid: "value", sortable: true },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "owner" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getLeadsAction(params);
  }
}
