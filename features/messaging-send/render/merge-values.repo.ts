import type { EntityType } from "@/generated/prisma";

export type MergeRecordRef = { entityType: EntityType; entityId: string };

export type MergeSource = {
  contact: { id: string; firstName: string; lastName: string; email: string | null } | null;
  organizationName: string | null;
  dealName: string | null;
  sender: { firstName: string; lastName: string; email: string } | null;
};

export abstract class MergeValuesRepo {
  abstract loadMergeSource(record: MergeRecordRef | null, senderUserId: string | null): Promise<MergeSource>;
}
