import type { ContactMergeRecordDto } from "../duplicate.schema";
import type { MergeMember, MergeSnapshot, WinnerUpdate } from "./merge-plan";

export type StoredMerge = {
  id: string;
  winnerId: string | null;
  loserIds: string[];
  snapshot: MergeSnapshot;
  createdAt: Date;
  undoneAt: Date | null;
};

export abstract class ContactMergeRepo {
  abstract loadMembersOrNull(ids: readonly string[]): Promise<MergeMember[] | null>;
  abstract mergeContacts(args: {
    winner: MergeMember;
    losers: readonly MergeMember[];
    update: WinnerUpdate;
    groupId?: string;
  }): Promise<string>;
  abstract findMergeOrNull(id: string): Promise<StoredMerge | null>;
  abstract contactIdsThatExist(ids: readonly string[]): Promise<Set<string>>;
  abstract undoMerge(merge: StoredMerge): Promise<void>;
  abstract listRecentMerges(take: number): Promise<ContactMergeRecordDto[]>;
}
