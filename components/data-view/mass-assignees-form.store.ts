import type { RootStore } from "@/core/stores/root.store";

import { BaseFormStore } from "@/core/base/base-form.store";

export type MassAssigneesFormState = { userIds: string[] };

export class MassAssigneesFormStore extends BaseFormStore<MassAssigneesFormState> {
  constructor(rootStore: RootStore) {
    super(rootStore, { userIds: [] });
    this.setWithUnsavedChangesGuard(false);
  }

  get userIds(): string[] {
    return this.form.userIds;
  }
}
