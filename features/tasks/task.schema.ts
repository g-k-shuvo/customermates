import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { ActivityKind, TaskType } from "@/generated/prisma";

import {
  CustomFieldValueSchema,
  UserReferenceSchema,
  ContactReferenceSchema,
  OrganizationReferenceSchema,
  DealReferenceSchema,
  NotesSchema,
} from "@/core/base/base-entity.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const TaskServiceReferenceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  amount: z.number(),
});

export const TaskDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(TaskType),
  notes: NotesSchema,
  activityKind: z.enum(ActivityKind).nullable(),
  dueAt: z.date().nullable(),
  durationMinutes: z.number().int().nullable(),
  completedAt: z.date().nullable(),
  completedById: z.uuid().nullable(),
  isOverdue: z
    .boolean()
    .default(false)
    .describe(
      "Whether the task is past its due date and still incomplete. Derived from dueAt and completedAt at read time, so it is absent from stored snapshots taken before the due date existed.",
    ),
  createdAt: z.date(),
  updatedAt: z.date(),
  users: z.array(UserReferenceSchema),
  contacts: z.array(ContactReferenceSchema),
  organizations: z.array(OrganizationReferenceSchema),
  deals: z.array(DealReferenceSchema),
  services: z.array(TaskServiceReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this task. Query available custom field configurations via GET /v1/tasks/configuration, which returns customColumns with their definitions.",
    ),
});

export type TaskDto = Data<typeof TaskDtoSchema>;

export const NextActivityDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  activityKind: z.enum(ActivityKind).nullable(),
  dueAt: z.date(),
  isOverdue: z.boolean(),
});

export type NextActivityDto = Data<typeof NextActivityDtoSchema>;

export const TaskByIdResponseSchema = z.object({
  task: TaskDtoSchema.nullable(),
  customColumns: z.array(CustomColumnDtoSchema),
});
