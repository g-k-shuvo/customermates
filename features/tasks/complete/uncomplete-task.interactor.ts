import type { UncompleteTaskRepo } from "./uncomplete-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { TaskWritePrecheckInteractor } from "../upsert/task-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const UncompleteTaskSchema = z.object({
  id: z.uuid(),
});
export type UncompleteTaskData = Data<typeof UncompleteTaskSchema>;

@TenantInteractor({ resource: Resource.tasks, action: Action.update })
export class UncompleteTaskInteractor extends AuthenticatedInteractor<UncompleteTaskData, TaskDto> {
  constructor(
    private repo: UncompleteTaskRepo,
    private eventService: EventService,
    private precheck: TaskWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UncompleteTaskSchema,
    output: TaskDtoSchema,
    precheck: (self, data, ctx) => self.precheck.uncomplete(data, ctx),
  })
  async invoke(data: UncompleteTaskData): Validated<TaskDto> {
    const previousTask = await this.repo.getOrThrowCompanyWide(data.id);

    if (!previousTask.completedAt) return failConflict(CustomErrorCode.taskNotCompleted, ["id"]);

    const task = await this.repo.uncompleteTaskOrThrow(data.id);

    if (!task) return failConflict(CustomErrorCode.taskNotCompleted, ["id"]);

    await this.eventService.publish(DomainEvent.TASK_UPDATED, {
      entityId: task.id,
      payload: {
        task,
        changes: calculateChanges(previousTask, task),
      },
    });

    return { ok: true as const, data: task };
  }
}
