import type { DomainEventHandlers } from "@/features/event/domain-event.listener";
import type { EventService } from "@/features/event/event.service";
import type { LeadFollowUpTaskRepo } from "./lead-follow-up-task.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";

export class LeadDeletedFollowUpTaskListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;

  constructor(
    private taskRepo: LeadFollowUpTaskRepo,
    private eventService: () => EventService,
  ) {
    super();

    this.handlers = {
      [DomainEvent.LEAD_DELETED]: async ({ entityId }) => {
        const tasks = await this.taskRepo.deleteOpenLeadFollowUpTasks(entityId);

        for (const task of tasks)
          await this.eventService().publish(DomainEvent.TASK_DELETED, { entityId: task.id, payload: task });
      },
    };
  }
}
