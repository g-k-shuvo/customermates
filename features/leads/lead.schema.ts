import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { LeadStatus } from "@/generated/prisma";

import { NotesSchema } from "@/core/base/base-entity.schema";

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
});

export type LeadDto = Data<typeof LeadDtoSchema>;

export const LeadListResponseSchema = z.object({
  leads: z.array(LeadDtoSchema),
  total: z.number(),
});

export type LeadListResponse = Data<typeof LeadListResponseSchema>;
