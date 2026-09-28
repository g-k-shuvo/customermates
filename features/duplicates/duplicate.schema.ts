import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { DuplicateGroupStatus, DuplicateMatchKeyKind, DuplicateScanStatus, EntityType } from "@/generated/prisma";

export const DUPLICATE_ENTITY_TYPES = [EntityType.contact, EntityType.organization] as const;
export const DUPLICATE_GROUP_PAGE_SIZE = 25;

export const DuplicateEntityTypeSchema = z.enum(DUPLICATE_ENTITY_TYPES);
export type DuplicateEntityType = Data<typeof DuplicateEntityTypeSchema>;

export function isDuplicateEntityType(entityType: EntityType): entityType is DuplicateEntityType {
  return (DUPLICATE_ENTITY_TYPES as readonly EntityType[]).includes(entityType);
}

export const StartDuplicateScanSchema = z.object({ entityType: DuplicateEntityTypeSchema });
export type StartDuplicateScanData = Data<typeof StartDuplicateScanSchema>;

export const DuplicateScanStepSchema = z.object({ scanId: z.uuid(), cursor: z.uuid().nullable() });
export type DuplicateScanStepData = Data<typeof DuplicateScanStepSchema>;

export const DuplicateScanIdSchema = z.object({ scanId: z.uuid() });
export type DuplicateScanIdData = Data<typeof DuplicateScanIdSchema>;

export const GetDuplicateGroupsSchema = z.object({
  entityType: DuplicateEntityTypeSchema,
  page: z.coerce.number().int().min(1).optional(),
});
export type GetDuplicateGroupsData = Data<typeof GetDuplicateGroupsSchema>;

export const DismissDuplicateGroupSchema = z.object({ id: z.uuid() });
export type DismissDuplicateGroupData = Data<typeof DismissDuplicateGroupSchema>;

export const SkippedBucketSchema = z.object({
  kind: z.enum(DuplicateMatchKeyKind),
  value: z.string(),
  size: z.number().int(),
});
export type SkippedBucket = Data<typeof SkippedBucketSchema>;

export const DuplicateScanDtoSchema = z.object({
  id: z.uuid(),
  entityType: DuplicateEntityTypeSchema,
  status: z.enum(DuplicateScanStatus),
  recordCount: z.number().int(),
  groupCount: z.number().int(),
  skippedBuckets: z.array(SkippedBucketSchema),
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
  startedBy: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
});
export type DuplicateScanDto = Data<typeof DuplicateScanDtoSchema>;

export const DuplicateContactMemberSchema = z.object({
  kind: z.literal(EntityType.contact),
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  organizations: z.array(z.object({ id: z.uuid(), name: z.string() })),
  customFieldValues: z.array(z.object({ columnId: z.uuid(), value: z.string() })),
  createdAt: z.date(),
});
export type DuplicateContactMember = Data<typeof DuplicateContactMemberSchema>;

export const DuplicateOrganizationMemberSchema = z.object({
  kind: z.literal(EntityType.organization),
  id: z.uuid(),
  name: z.string(),
  domains: z.array(z.string()),
  contactCount: z.number().int(),
  dealCount: z.number().int(),
  customFieldValues: z.array(z.object({ columnId: z.uuid(), value: z.string() })),
  createdAt: z.date(),
});
export type DuplicateOrganizationMember = Data<typeof DuplicateOrganizationMemberSchema>;

export const DuplicateMemberSchema = z.discriminatedUnion("kind", [
  DuplicateContactMemberSchema,
  DuplicateOrganizationMemberSchema,
]);
export type DuplicateMemberDto = Data<typeof DuplicateMemberSchema>;

export const DuplicateGroupDtoSchema = z.object({
  id: z.uuid(),
  status: z.enum(DuplicateGroupStatus),
  score: z.number(),
  signals: z.array(z.enum(DuplicateMatchKeyKind)),
  members: z.array(DuplicateMemberSchema),
});
export type DuplicateGroupDto = Data<typeof DuplicateGroupDtoSchema>;

export const DuplicateGroupListDtoSchema = z.object({
  scan: DuplicateScanDtoSchema.nullable(),
  groups: z.array(DuplicateGroupDtoSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type DuplicateGroupListDto = Data<typeof DuplicateGroupListDtoSchema>;

export const MAX_MERGE_LOSERS = 9;
export const MERGE_UNDO_DAYS = 30;

export const MergeContactsSchema = z.object({
  winnerId: z.uuid(),
  loserIds: z.array(z.uuid()).min(1).max(MAX_MERGE_LOSERS),
  groupId: z.uuid().optional(),
  fields: z
    .object({
      firstName: z.uuid().optional(),
      lastName: z.uuid().optional(),
      customFields: z.record(z.uuid(), z.uuid()).optional(),
    })
    .optional(),
});
export type MergeContactsData = Data<typeof MergeContactsSchema>;

export const MergeOrganizationsSchema = z.object({
  winnerId: z.uuid(),
  loserIds: z.array(z.uuid()).min(1).max(MAX_MERGE_LOSERS),
  groupId: z.uuid().optional(),
  fields: z
    .object({
      name: z.uuid().optional(),
      customFields: z.record(z.uuid(), z.uuid()).optional(),
    })
    .optional(),
});
export type MergeOrganizationsData = Data<typeof MergeOrganizationsSchema>;

export const MergeContactsResultSchema = z.object({ mergeId: z.uuid(), winnerId: z.uuid() });
export type MergeContactsResult = Data<typeof MergeContactsResultSchema>;

export const ContactMergeIdSchema = z.object({ id: z.uuid() });
export type ContactMergeIdData = Data<typeof ContactMergeIdSchema>;

export const ContactMergeRecordDtoSchema = z.object({
  id: z.uuid(),
  winner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  loserNames: z.array(z.string()),
  mergedBy: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  createdAt: z.date(),
  undoneAt: z.date().nullable(),
  undoable: z.boolean(),
});
export type ContactMergeRecordDto = Data<typeof ContactMergeRecordDtoSchema>;
