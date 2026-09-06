import type { Data } from "@/core/validation/validation.utils";
import type { TaskDto } from "../task.schema";
import type { CreateTaskData } from "../upsert/create-task.interactor";

import { z } from "zod";
import { ActivityKind } from "@/generated/prisma";

import { zx } from "@/core/validation/validation.utils";

export const ScheduleFollowUpSchema = z.object({
  name: zx.nonBlankText(255),
  activityKind: z.enum(ActivityKind).optional(),
  dueAt: z.coerce.date(),
  durationMinutes: z.number().int().min(1).optional(),
});

export type ScheduleFollowUpData = Data<typeof ScheduleFollowUpSchema>;

export function followUpActivityFrom(task: TaskDto, followUp: ScheduleFollowUpData): CreateTaskData {
  return {
    name: followUp.name,
    notes: null,
    activityKind: followUp.activityKind,
    dueAt: followUp.dueAt,
    durationMinutes: followUp.durationMinutes,
    userIds: task.users.map((user) => user.id),
    contactIds: task.contacts.map((contact) => contact.id),
    organizationIds: task.organizations.map((organization) => organization.id),
    dealIds: task.deals.map((deal) => deal.id),
    serviceIds: task.services.map((service) => service.id),
    customFieldValues: [],
  };
}
