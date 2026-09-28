import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type {
  ContactMergeRecordDto,
  DuplicateEntityType,
  DuplicateGroupDto,
  DuplicateGroupListDto,
  DuplicateMemberDto,
} from "@/features/duplicates/duplicate.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { toast } from "sonner";
import { DuplicateScanStatus, EntityType } from "@/generated/prisma";

import {
  dismissDuplicateGroupAction,
  getContactMergesAction,
  getDuplicateGroupsAction,
  getOrganizationMergesAction,
  mergeContactsAction,
  mergeOrganizationsAction,
  startDuplicateScanAction,
  undoContactMergeAction,
  undoOrganizationMergeAction,
} from "../../duplicates/actions";

import { getCustomColumnsByEntityTypeAction } from "@/app/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export const DUPLICATE_POLL_INTERVAL_MS = 3000;

export type DuplicatesPageState = "loading" | "error" | "empty" | "content";

export type MergeField = "firstName" | "lastName" | "name";

export type MergeMessages = { merged: string; undo: string; undone: string };

function valueOf(member: DuplicateMemberDto, columnId: string): string {
  return member.customFieldValues.find((entry) => entry.columnId === columnId)?.value ?? "";
}

export class DuplicatesStore {
  data: DuplicateGroupListDto | null = null;
  loadFailed = false;
  isStarting = false;
  dismissingIds = new Set<string>();
  merges: ContactMergeRecordDto[] = [];
  customColumns: CustomColumnDto[] = [];
  mergeGroup: DuplicateGroupDto | null = null;
  winnerId: string | null = null;
  fieldSources: Partial<Record<MergeField, string>> = {};
  customFieldSources: Record<string, string> = {};
  isMerging = false;
  undoingIds = new Set<string>();

  constructor(readonly entityType: DuplicateEntityType) {
    makeObservable(this, {
      data: observable.ref,
      loadFailed: observable,
      isStarting: observable,
      dismissingIds: observable.ref,
      merges: observable.ref,
      customColumns: observable.ref,
      mergeGroup: observable.ref,
      winnerId: observable,
      fieldSources: observable.ref,
      customFieldSources: observable.ref,
      isMerging: observable,
      undoingIds: observable.ref,
      isScanning: computed,
      pageState: computed,
      differingColumns: computed,
      hydrate: action,
      setLoadFailed: action,
      setStarting: action,
      setDismissing: action,
      setMerges: action,
      setCustomColumns: action,
      openMerge: action,
      closeMerge: action,
      chooseWinner: action,
      chooseFieldSource: action,
      chooseCustomFieldSource: action,
      setMerging: action,
      setUndoing: action,
    });
  }

  get isScanning(): boolean {
    return this.data?.scan?.status === DuplicateScanStatus.running;
  }

  get pageState(): DuplicatesPageState {
    if (this.loadFailed) return "error";
    if (!this.data) return "loading";

    return this.data.groups.length === 0 ? "empty" : "content";
  }

  get differingColumns(): CustomColumnDto[] {
    const members = this.mergeGroup?.members ?? [];

    return this.customColumns.filter((column) => new Set(members.map((member) => valueOf(member, column.id))).size > 1);
  }

  hydrate = (data: DuplicateGroupListDto) => {
    this.data = data;
    this.loadFailed = false;
  };

  setLoadFailed = (failed: boolean) => {
    this.loadFailed = failed;
  };

  setStarting = (starting: boolean) => {
    this.isStarting = starting;
  };

  setDismissing = (id: string, dismissing: boolean) => {
    const next = new Set(this.dismissingIds);
    if (dismissing) next.add(id);
    else next.delete(id);
    this.dismissingIds = next;
  };

  setUndoing = (id: string, undoing: boolean) => {
    const next = new Set(this.undoingIds);
    if (undoing) next.add(id);
    else next.delete(id);
    this.undoingIds = next;
  };

  setMerges = (merges: ContactMergeRecordDto[]) => {
    this.merges = merges;
  };

  setCustomColumns = (columns: CustomColumnDto[]) => {
    this.customColumns = columns;
  };

  setMerging = (merging: boolean) => {
    this.isMerging = merging;
  };

  openMerge = (group: DuplicateGroupDto) => {
    this.mergeGroup = group;
    this.chooseWinner(group.members[0]?.id ?? null);
    if (this.customColumns.length === 0) void this.loadCustomColumns().catch(reportApplicationError);
  };

  closeMerge = () => {
    this.mergeGroup = null;
    this.winnerId = null;
    this.fieldSources = {};
    this.customFieldSources = {};
  };

  chooseWinner = (id: string | null) => {
    this.winnerId = id;
    this.fieldSources = {};
    this.customFieldSources = {};
  };

  chooseFieldSource = (field: MergeField, sourceId: string) => {
    this.fieldSources = { ...this.fieldSources, [field]: sourceId };
  };

  chooseCustomFieldSource = (columnId: string, sourceId: string) => {
    this.customFieldSources = { ...this.customFieldSources, [columnId]: sourceId };
  };

  load = async (page = this.data?.page ?? 1) => {
    const result = await getDuplicateGroupsAction({ entityType: this.entityType, page });
    if (result.ok) this.hydrate(result.data);
    else this.setLoadFailed(true);
  };

  loadMerges = async () => {
    const result =
      this.entityType === EntityType.contact ? await getContactMergesAction() : await getOrganizationMergesAction();
    if (result.ok) this.setMerges(result.data);
  };

  loadCustomColumns = async () => {
    this.setCustomColumns(await getCustomColumnsByEntityTypeAction({ entityType: this.entityType }));
  };

  startScan = async () => {
    this.setStarting(true);
    try {
      const result = await startDuplicateScanAction({ entityType: this.entityType });
      if (!result.ok) toastZodErrorTree(result.error);
      await this.load(1);
    } finally {
      this.setStarting(false);
    }
  };

  dismiss = async (id: string, dismissedMessage: string) => {
    this.setDismissing(id, true);
    try {
      const result = await dismissDuplicateGroupAction(id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      toast.success(dismissedMessage);
      await this.load();
    } finally {
      this.setDismissing(id, false);
    }
  };

  private merge(winnerId: string, loserIds: string[], groupId: string) {
    const customFields = this.customFieldSources;
    const { firstName, lastName, name } = this.fieldSources;

    return this.entityType === EntityType.contact
      ? mergeContactsAction({ winnerId, loserIds, groupId, fields: { firstName, lastName, customFields } })
      : mergeOrganizationsAction({ winnerId, loserIds, groupId, fields: { name, customFields } });
  }

  confirmMerge = async (messages: MergeMessages) => {
    const group = this.mergeGroup;
    const winnerId = this.winnerId;
    if (!group || !winnerId) return;

    this.setMerging(true);
    try {
      const loserIds = group.members.map((member) => member.id).filter((id) => id !== winnerId);
      const result = await this.merge(winnerId, loserIds, group.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      const mergeId = result.data.mergeId;
      this.closeMerge();
      toast.success(messages.merged, {
        action: {
          label: messages.undo,
          onClick: () => void this.undo(mergeId, messages.undone).catch(reportApplicationError),
        },
      });
      await Promise.all([this.load(), this.loadMerges()]);
    } finally {
      this.setMerging(false);
    }
  };

  undo = async (mergeId: string, undoneMessage: string) => {
    this.setUndoing(mergeId, true);
    try {
      const result =
        this.entityType === EntityType.contact
          ? await undoContactMergeAction(mergeId)
          : await undoOrganizationMergeAction(mergeId);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      toast.success(undoneMessage);
      await Promise.all([this.load(), this.loadMerges()]);
    } finally {
      this.setUndoing(mergeId, false);
    }
  };
}
