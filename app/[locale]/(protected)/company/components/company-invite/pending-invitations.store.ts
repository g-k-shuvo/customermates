import type { RootStore } from "@/core/stores/root.store";
import type { PendingInvitationDto } from "@/features/company/invitations/invitation.schema";

import { action, makeObservable, observable } from "mobx";

import { getPendingInvitationsAction, resendInvitationAction, revokeInvitationAction } from "../../actions";

import { BaseStore } from "@/core/base/base.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class PendingInvitationsStore extends BaseStore {
  items: PendingInvitationDto[] = [];
  busyId: string | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      items: observable,
      busyId: observable,
      setItems: action,
      setBusyId: action,
    });
  }

  setItems = (items: PendingInvitationDto[]): void => {
    this.items = items;
  };

  setBusyId = (id: string | null): void => {
    this.busyId = id;
  };

  load = async (): Promise<void> => {
    const result = await getPendingInvitationsAction();
    if (result.ok) this.setItems(result.data);
  };

  resend = async (id: string): Promise<void> => {
    if (await this.change(id, () => resendInvitationAction({ id }))) this.toastSuccess("Common.notifications.resent");
  };

  revoke = async (id: string): Promise<void> => {
    if (await this.change(id, () => revokeInvitationAction({ id })))
      this.toastSuccess("CompanyInviteModal.pending.revoked");
  };

  private change = async (id: string, send: () => ReturnType<typeof revokeInvitationAction>): Promise<boolean> => {
    this.setBusyId(id);
    try {
      const result = await send();
      if (!result.ok) {
        toastZodErrorTree(result.error);
        await this.load();
        return false;
      }

      await this.load();
      return true;
    } finally {
      this.setBusyId(null);
    }
  };
}
