import type { SendEmailRecipient } from "../automation-action.schema";
import type { AutomationStepError } from "../automation-step-errors";
import type { EntityType } from "@/generated/prisma";

export type AutomationEmail = {
  recipient: SendEmailRecipient;
  subject: string;
  body: string;
  bannerUrl?: string | null;
  runStepId: string;
  record: { entityType: EntityType; entityId: string } | null;
};

export type AutomationEmailResult =
  | { sent: true; to: string; duplicate: boolean }
  | { sent: false; code: AutomationStepError };

export abstract class AutomationEmailSender {
  abstract send(args: AutomationEmail): Promise<AutomationEmailResult>;
}
