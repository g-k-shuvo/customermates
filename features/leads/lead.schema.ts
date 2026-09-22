import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { LeadStatus } from "@/generated/prisma";

import { CustomFieldValueSchema, NotesSchema } from "@/core/base/base-entity.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const LeadReferenceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
});

export const LeadContactSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
});

export const LeadOrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const LeadOwnerSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
});

export const LeadSourceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

export const LeadDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(LeadStatus),
  sourceOrigin: z.string(),
  labels: z.array(z.string()),
  value: z.number().nullable(),
  notes: NotesSchema,
  convertedDealId: z.uuid().nullable(),
  convertedAt: z.date().nullable(),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  contact: LeadContactSchema.nullable(),
  organization: LeadOrganizationSchema.nullable(),
  owner: LeadOwnerSchema.nullable(),
  source: LeadSourceSchema.nullable(),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this lead. Query available custom field configurations via GET /v1/leads/configuration, which returns customColumns with their definitions.",
    ),
});

export type LeadDto = Data<typeof LeadDtoSchema>;

export const LeadListResponseSchema = z.object({
  leads: z.array(LeadDtoSchema),
  total: z.number(),
});

export type LeadListResponse = Data<typeof LeadListResponseSchema>;

export const LeadByIdResponseSchema = z.object({
  lead: LeadDtoSchema.nullable(),
  customColumns: z.array(CustomColumnDtoSchema),
});

export type LeadByIdResponse = Data<typeof LeadByIdResponseSchema>;
