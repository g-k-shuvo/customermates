import type { WebFormSubmissionDto } from "@/features/webform/submissions/web-form-submission.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource } from "@/generated/prisma";

import { getWebFormSubmissionsAction } from "../../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class WebFormSubmissionsStore extends BaseDataViewStore<WebFormSubmissionDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.leads);
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "receivedAt", sortable: true },
      { uid: "source" },
      { uid: "name" },
      { uid: "status", sortable: true },
      { uid: "lead" },
      { uid: "error" },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getWebFormSubmissionsAction(params);
  }
}
