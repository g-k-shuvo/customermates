import type { RootStore } from "@/core/stores/root.store";

import { BaseFormStore } from "@/core/base/base-form.store";

export type DeleteStageFormData = {
  moveToStageId: string;
};

export class DeleteStageModalStore extends BaseFormStore<DeleteStageFormData> {
  constructor(rootStore: RootStore) {
    super(rootStore, { moveToStageId: "" });

    this.setWithUnsavedChangesGuard(false);
  }

  get moveToStageId(): string {
    return this.form.moveToStageId;
  }

  resetDestination = (): void => {
    this.onInitOrRefresh({ moveToStageId: "" });
  };
}
