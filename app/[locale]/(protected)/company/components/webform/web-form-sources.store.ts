import type { WebFormSourceDto } from "@/features/webform/webform-source.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource } from "@/generated/prisma";

import { getWebFormSourcesAction } from "../../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class WebFormSourcesStore extends BaseDataViewStore<WebFormSourceDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.leads);
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: true },
      { uid: "endpointPath", sortable: false },
      { uid: "status", sortable: false },
      { uid: "defaultLabels", sortable: false },
      { uid: "createdAt", sortable: true },
      { uid: "updatedAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getWebFormSourcesAction(params);
  }
}
