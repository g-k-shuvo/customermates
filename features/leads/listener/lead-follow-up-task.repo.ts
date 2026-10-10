import type { TaskDto } from "@/features/tasks/task.schema";

export type CreateLeadFollowUpTaskArgs = {
  leadId: string;
  name: string;
  dueAt: Date;
  ownerUserId: string | null;
  contactId: string | null;
  organizationId: string | null;
};

export abstract class LeadFollowUpTaskRepo {
  abstract createLeadFollowUpTaskOrThrow(args: CreateLeadFollowUpTaskArgs): Promise<{ id: string }>;
  abstract deleteOpenLeadFollowUpTasks(leadId: string): Promise<TaskDto[]>;
}
