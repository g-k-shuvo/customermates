import type { ContactMergeRecordDto } from "../duplicate.schema";
import type { OrganizationMergeMember, OrganizationMergeSnapshot, OrganizationUpdate } from "./merge-plan";

export type StoredOrganizationMerge = {
  id: string;
  winnerId: string | null;
  loserIds: string[];
  snapshot: OrganizationMergeSnapshot;
  createdAt: Date;
  undoneAt: Date | null;
};

export abstract class OrganizationMergeRepo {
  abstract loadOrganizationsOrNull(ids: readonly string[]): Promise<OrganizationMergeMember[] | null>;
  abstract mergeOrganizations(args: {
    winner: OrganizationMergeMember;
    losers: readonly OrganizationMergeMember[];
    update: OrganizationUpdate;
    groupId?: string;
  }): Promise<string>;
  abstract findOrganizationMergeOrNull(id: string): Promise<StoredOrganizationMerge | null>;
  abstract organizationIdsThatExist(ids: readonly string[]): Promise<Set<string>>;
  abstract undoOrganizationMerge(merge: StoredOrganizationMerge): Promise<void>;
  abstract listRecentOrganizationMerges(take: number): Promise<ContactMergeRecordDto[]>;
}
