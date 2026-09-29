import type {
  MailComposeData,
  MailDraftDto,
  MailOutboxMessageDto,
  ThreadStateDto,
  UpsertMailLabelData,
} from "./mail-workspace.schema";
import type { MailThreadLabelDto } from "@/features/mailbox/mailbox.schema";

export type OwnThread = { id: string; subject: string | null; canSend: boolean };

export type DueOutboxMessage = {
  id: string;
  companyId: string;
  userId: string;
  threadId: string;
  mode: "reply" | "forward";
  replyAll: boolean;
  body: string;
  recipients: string[];
  attempts: number;
};

export abstract class MailDraftRepo {
  abstract findOwnThread(threadId: string): Promise<OwnThread | null>;
  abstract getDraft(threadId: string): Promise<MailDraftDto | null>;
  abstract saveDraft(data: MailComposeData): Promise<MailDraftDto>;
  abstract deleteDraft(threadId: string): Promise<void>;
}

export abstract class MailOutboxRepo {
  abstract findOwnThread(threadId: string): Promise<OwnThread | null>;
  abstract createOutboxMessage(data: MailComposeData & { sendAt: Date }): Promise<MailOutboxMessageDto>;
  abstract listOpenOutboxMessages(): Promise<MailOutboxMessageDto[]>;
  abstract findOwnOutboxMessage(id: string): Promise<MailOutboxMessageDto | null>;
  abstract cancelOutboxMessage(id: string): Promise<MailOutboxMessageDto | null>;
  abstract rescheduleOutboxMessage(id: string, sendAt: Date): Promise<MailOutboxMessageDto | null>;
  abstract deleteDraft(threadId: string): Promise<void>;
  abstract saveDraft(data: MailComposeData): Promise<MailDraftDto>;
}

export abstract class DueMailOutboxRepo {
  abstract claimDueOutboxMessagesUnscoped(now: Date, staleBefore: Date, limit: number): Promise<DueOutboxMessage[]>;
  abstract markOutboxSentUnscoped(message: DueOutboxMessage, sentAt: Date): Promise<void>;
  abstract markOutboxAttemptFailedUnscoped(
    message: DueOutboxMessage,
    outcome: { error: string; retryAt: Date | null },
  ): Promise<void>;
}

export abstract class MailThreadStateRepo {
  abstract setArchived(threadId: string, archived: boolean, now: Date): Promise<ThreadStateDto | null>;
  abstract setFollowUp(threadId: string, followUpAt: Date | null): Promise<ThreadStateDto | null>;
}

export abstract class MailLabelRepo {
  abstract listLabels(): Promise<MailThreadLabelDto[]>;
  abstract findLabelByName(name: string): Promise<MailThreadLabelDto | null>;
  abstract createLabel(data: UpsertMailLabelData): Promise<MailThreadLabelDto>;
  abstract updateLabel(id: string, data: UpsertMailLabelData): Promise<MailThreadLabelDto | null>;
  abstract deleteLabel(id: string): Promise<boolean>;
  abstract countLabels(ids: readonly string[]): Promise<number>;
  abstract threadIsReadable(threadId: string): Promise<boolean>;
  abstract setThreadLabels(threadId: string, labelIds: readonly string[]): Promise<MailThreadLabelDto[]>;
}
