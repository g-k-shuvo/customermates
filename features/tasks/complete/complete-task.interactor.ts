import type { CompleteTaskRepo } from "./complete-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { TaskWritePrecheckInteractor } from "../upsert/task-write-precheck.interactor";
import type { CreateTaskData } from "../upsert/create-task.interactor";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { ScheduleFollowUpSchema, followUpActivityFrom } from "./follow-up-activity";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const CompleteTaskSchema = z.object({
  id: z.uuid(),
  followUp: ScheduleFollowUpSchema.nullish(),
});
export type CompleteTaskData = Data<typeof CompleteTaskSchema>;

export const CompleteTaskResultSchema = z.object({
  task: TaskDtoSchema,
  followUpTask: TaskDtoSchema.nullable(),
});
export type CompleteTaskResult = Data<typeof CompleteTaskResultSchema>;

export abstract class ScheduleFollowUpPort {
  abstract invoke(data: CreateTaskData): Validated<TaskDto>;
}

@TenantInteractor({ resource: Resource.tasks, action: Action.update })
export class CompleteTaskInteractor extends AuthenticatedInteractor<CompleteTaskData, CompleteTaskResult> {
  constructor(
    private repo: CompleteTaskRepo,
    private eventService: EventService,
    private precheck: TaskWritePrecheckInteractor,
    private scheduleFollowUp: ScheduleFollowUpPort,
  ) {
    super();
  }

  @Write({
    input: CompleteTaskSchema,
    output: CompleteTaskResultSchema,
    precheck: (self, data, ctx) => self.precheck.complete(data, ctx),
  })
  async invoke(data: CompleteTaskData): Validated<CompleteTaskResult> {
    const previousTask = await this.repo.getOrThrowCompanyWide(data.id);

    if (previousTask.completedAt) return failConflict(CustomErrorCode.taskAlreadyCompleted, ["id"]);

    const task = await this.repo.completeTaskOrThrow(data.id);

    if (!task) return failConflict(CustomErrorCode.taskAlreadyCompleted, ["id"]);

    await this.eventService.publish(DomainEvent.TASK_UPDATED, {
      entityId: task.id,
      payload: {
        task,
        changes: calculateChanges(previousTask, task),
      },
    });

    if (!data.followUp) return { ok: true as const, data: { task, followUpTask: null } };

    const followUp = await this.scheduleFollowUp.invoke(followUpActivityFrom(task, data.followUp));

    if (!followUp.ok) return followUp;

    return { ok: true as const, data: { task, followUpTask: followUp.data } };
  }
}
