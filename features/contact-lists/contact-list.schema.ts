import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { FilterSchema } from "@/core/base/base-get.schema";
import { BulkJobDtoSchema } from "@/features/bulk-job/bulk-job.schema";

export const CONTACT_LIST_READ = {
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR" as const,
};
export const CONTACT_LIST_WRITE = { resource: Resource.contacts, action: Action.update };

export const MANUAL_MEMBER_LIMIT = 100;
export const MEMBER_PAGE_SIZE = 25;

export const ContactListDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ContactListDto = Data<typeof ContactListDtoSchema>;

export const ContactListMemberDtoSchema = z.object({
  contactId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  addedAt: z.date(),
});
export type ContactListMemberDto = Data<typeof ContactListMemberDtoSchema>;

export const ContactListMembersDtoSchema = z.object({
  items: z.array(ContactListMemberDtoSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type ContactListMembersDto = Data<typeof ContactListMembersDtoSchema>;

const ListName = z.string().trim().min(1).max(120);
const ListDescription = z.string().trim().max(1000).nullable().optional();

export const CreateContactListSchema = z.object({ name: ListName, description: ListDescription });
export type CreateContactListData = Data<typeof CreateContactListSchema>;

export const UpdateContactListSchema = z.object({ id: z.uuid(), name: ListName, description: ListDescription });
export type UpdateContactListData = Data<typeof UpdateContactListSchema>;

export const ContactListIdSchema = z.object({ id: z.uuid() });
export type ContactListIdData = Data<typeof ContactListIdSchema>;

export const GetContactListMembersSchema = z.object({ id: z.uuid(), page: z.number().int().min(1).default(1) });
export type GetContactListMembersData = z.input<typeof GetContactListMembersSchema>;

export const ChangeContactListMembersSchema = z.object({
  id: z.uuid(),
  contactIds: z.array(z.uuid()).min(1).max(MANUAL_MEMBER_LIMIT),
});
export type ChangeContactListMembersData = Data<typeof ChangeContactListMembersSchema>;

export const MemberChangeDtoSchema = z.object({ changed: z.number().int() });
export type MemberChangeDto = Data<typeof MemberChangeDtoSchema>;

export const FillContactListSchema = z.object({
  id: z.uuid(),
  filters: z.array(FilterSchema).max(20).default([]),
  searchTerm: z.string().trim().max(200).nullish(),
});
export type FillContactListData = z.input<typeof FillContactListSchema>;

export const ContactListFillDefinitionSchema = FillContactListSchema.omit({ id: true });
export type ContactListFillDefinition = Data<typeof ContactListFillDefinitionSchema>;

export const FillContactListResultSchema = BulkJobDtoSchema;
