import type { AutomationActionOutcome } from "./automation-action-executor";
import type { EntityType } from "@/generated/prisma";

export type AutomationTaskLinks = {
  contactIds?: string[];
  organizationIds?: string[];
  dealIds?: string[];
  serviceIds?: string[];
};

export abstract class AutomationRecordWriter {
  abstract setField(args: {
    entityType: EntityType;
    entityId: string;
    field: string;
    value: unknown;
  }): Promise<AutomationActionOutcome>;

  abstract assignOwner(args: {
    entityType: EntityType;
    entityId: string;
    userId: string | null;
  }): Promise<AutomationActionOutcome>;

  abstract addLeadLabels(args: { entityId: string; labels: string[] }): Promise<AutomationActionOutcome>;

  abstract appendNote(args: {
    entityType: EntityType;
    entityId: string;
    body: string;
  }): Promise<AutomationActionOutcome>;

  abstract taskLinksFor(entityType: EntityType, entityId: string): AutomationTaskLinks;
}
