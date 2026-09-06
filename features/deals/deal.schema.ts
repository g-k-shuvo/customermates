import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { ActivityKind, DealStatus } from "@/generated/prisma";

import {
  CustomFieldValueSchema,
  ContactReferenceSchema,
  OrganizationReferenceSchema,
  UserReferenceSchema,
  ServiceReferenceSchema,
  TaskReferenceSchema,
  NotesSchema,
} from "@/core/base/base-entity.schema";
import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";
import { PipelineDtoSchema } from "@/features/pipelines/pipeline.schema";

export const DealActivityReferenceSchema = TaskReferenceSchema.extend({
  activityKind: z.enum(ActivityKind).nullable().default(null),
  dueAt: z.date().nullable().default(null),
  completedAt: z.date().nullable().default(null),
});

export type DealActivityReference = Data<typeof DealActivityReferenceSchema>;

export const DealDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  totalValue: z.number(),
  totalQuantity: z.number(),
  weightedValue: z.number().nullable(),
  notes: NotesSchema,
  pipelineId: z.uuid().nullable(),
  stageId: z.uuid().nullable(),
  status: z.enum(DealStatus),
  expectedCloseDate: z.date().nullable(),
  probability: z.number().min(0).max(100).nullable(),
  stageEnteredAt: z.date().nullable(),
  isRotting: z
    .boolean()
    .default(false)
    .describe(
      "Whether the deal has passed the rotting deadline its stage sets. Derived from the stored deadline at read time, so it is absent from stored snapshots taken before the deadline existed.",
    ),
  lostReasonId: z.uuid().nullable(),
  lostNotes: z.string().nullable(),
  wonAt: z.date().nullable(),
  lostAt: z.date().nullable(),
  closedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  organizations: z.array(OrganizationReferenceSchema),
  users: z.array(UserReferenceSchema),
  contacts: z.array(ContactReferenceSchema),
  services: z.array(ServiceReferenceSchema),
  tasks: z.array(DealActivityReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this deal. Query available custom field configurations via GET /v1/deals/configuration, which returns customColumns with their definitions.",
    ),
});

export type DealDto = Data<typeof DealDtoSchema>;

export const DealByIdResponseSchema = z.object({
  deal: DealDtoSchema.nullable(),
  customColumns: z.array(CustomColumnDtoSchema),
});

export const DealsConfigurationSchema = GetConfigurationSchema.extend({
  pipelines: z.array(PipelineDtoSchema),
});

export type DealsConfiguration = Data<typeof DealsConfigurationSchema>;
