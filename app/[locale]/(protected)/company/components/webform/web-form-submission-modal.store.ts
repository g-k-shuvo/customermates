import type { RootStore } from "@/core/stores/root.store";
import type { WebFormSubmissionDto } from "@/features/webform/submissions/web-form-submission.schema";

import { action, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import { retryWebFormSubmissionAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class WebFormSubmissionModalStore extends BaseModalStore<WebFormSubmissionDto> {
  public isRetrying = false;

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        id: "",
        sourceId: "",
        sourceName: "",
        externalId: null,
        status: "received",
        error: null,
        email: null,
        name: null,
        leadId: null,
        leadTitle: null,
        rawPayload: null,
        receivedAt: new Date(0),
        processedAt: null,
      },
      Resource.leads,
    );

    makeObservable(this, {
      isRetrying: observable,
      setRetrying: action,
    });
  }

  get canRetry(): boolean {
    return this.form.status === "failed" && this.form.leadId === null && this.canManage;
  }

  setRetrying = (isRetrying: boolean) => {
    this.isRetrying = isRetrying;
  };

  retry = async () => {
    if (!this.form.id) return;

    this.setRetrying(true);

    try {
      const result = await retryWebFormSubmissionAction({ id: this.form.id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      this.onInitOrRefresh(result.data);
      await this.rootStore.webFormSubmissionsStore.refresh();
    } finally {
      this.setRetrying(false);
    }
  };
}
