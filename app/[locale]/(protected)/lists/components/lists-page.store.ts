import type { BulkJobDto } from "@/features/bulk-job/bulk-job.schema";
import type { ContactListDto, ContactListMembersDto } from "@/features/contact-lists/contact-list.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { BulkJobStatus } from "@/generated/prisma";

import {
  getBulkJobAction,
  getContactListMembersAction,
  getContactListsAction,
  removeContactListMembersAction,
} from "../actions";

export type ListsPageState = "loading" | "error" | "true-empty" | "content";

export const JOB_POLL_MS = 2000;

export class ListsPageStore {
  lists: ContactListDto[] | null = null;
  selectedId: string | null = null;
  members: ContactListMembersDto | null = null;
  job: BulkJobDto | null = null;
  loadFailed = false;

  constructor(initial: ContactListDto[]) {
    this.lists = initial;
    this.selectedId = initial[0]?.id ?? null;

    makeObservable(this, {
      lists: observable.ref,
      selectedId: observable,
      members: observable.ref,
      job: observable.ref,
      loadFailed: observable,
      pageState: computed,
      selected: computed,
      jobRunning: computed,
      lastMemberPage: computed,
      setLists: action,
      select: action,
      setMembers: action,
      setJob: action,
      setLoadFailed: action,
    });
  }

  get pageState(): ListsPageState {
    if (this.loadFailed) return "error";
    if (!this.lists) return "loading";

    return this.lists.length > 0 ? "content" : "true-empty";
  }

  get selected(): ContactListDto | null {
    return this.lists?.find((list) => list.id === this.selectedId) ?? null;
  }

  get jobRunning(): boolean {
    return this.job?.status === BulkJobStatus.running;
  }

  get lastMemberPage(): number {
    return this.members ? Math.max(1, Math.ceil(this.members.total / this.members.pageSize)) : 1;
  }

  setLists = (lists: ContactListDto[]) => {
    this.lists = lists;
    this.loadFailed = false;
    if (!lists.some((list) => list.id === this.selectedId)) this.selectedId = lists[0]?.id ?? null;
  };

  select = (id: string | null) => {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.members = null;
    this.job = null;
  };

  setMembers = (members: ContactListMembersDto | null) => {
    this.members = members;
  };

  setJob = (job: BulkJobDto | null) => {
    this.job = job;
  };

  setLoadFailed = (failed: boolean) => {
    this.loadFailed = failed;
  };

  reload = async () => {
    const result = await getContactListsAction();
    if (result.ok) this.setLists(result.data);
    else this.setLoadFailed(true);
  };

  loadMembers = async (page = this.members?.page ?? 1) => {
    const id = this.selectedId;
    if (!id) return;

    const result = await getContactListMembersAction({ id, page });
    if (result.ok && this.selectedId === id) this.setMembers(result.data);
  };

  removeMember = async (contactId: string) => {
    const id = this.selectedId;
    if (!id) return;

    const result = await removeContactListMembersAction({ id, contactIds: [contactId] });
    if (result.ok) await Promise.all([this.loadMembers(), this.reload()]);
  };

  refreshJob = async () => {
    const job = this.job;
    if (!job) return;

    const result = await getBulkJobAction(job.id);
    if (!result.ok) return;

    this.setJob(result.data);
    if (result.data.status !== BulkJobStatus.running) await Promise.all([this.loadMembers(1), this.reload()]);
  };
}
