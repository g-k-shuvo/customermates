import { describe, expect, it, vi } from "vitest";

import { LeadDeletedFollowUpTaskListener } from "../listener/lead-deleted-follow-up-task.listener";
import { DomainEvent } from "@/features/event/domain-events";

const LEAD_ID = "00000000-0000-4000-8000-000000000401";

function setup(deleted: { id: string }[]) {
  const taskRepo = { deleteOpenLeadFollowUpTasks: vi.fn().mockResolvedValue(deleted) };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const listener = new LeadDeletedFollowUpTaskListener(taskRepo as never, () => eventService as never);
  const handler = listener.handlers[DomainEvent.LEAD_DELETED];
  if (!handler) throw new Error("listener does not handle lead.deleted");

  return { taskRepo, eventService, handle: () => handler({ entityId: LEAD_ID, payload: {} } as never) };
}

describe("deleting a lead", () => {
  it("removes its open follow-up task and announces the deletion", async () => {
    const { taskRepo, eventService, handle } = setup([{ id: "task-1" }]);

    await handle();

    expect(taskRepo.deleteOpenLeadFollowUpTasks).toHaveBeenCalledWith(LEAD_ID);
    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.TASK_DELETED, {
      entityId: "task-1",
      payload: { id: "task-1" },
    });
  });

  it("publishes nothing when the follow-up was already done or never existed", async () => {
    const { eventService, handle } = setup([]);

    await handle();

    expect(eventService.publish).not.toHaveBeenCalled();
  });
});
