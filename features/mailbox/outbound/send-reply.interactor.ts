import type { Validated } from "@/core/validation/validation.utils";
import type { SecretBoxKey } from "../credentials/secret-box";
import type { SendReplyService } from "./send-reply.service";

import { Resource, Action } from "@/generated/prisma";

import { SendReplyOutcomeSchema, SendReplySchema } from "../mailbox.schema";
import { type SendReplyData, type SendReplyOutcome } from "../mailbox.schema";
import { buildReply } from "./build-reply";
import { openSecret } from "../credentials/secret-box";
import { recoverRfcMessageId, recoverThreadRootMessageId, STORED_MESSAGE_ID_PREFIX } from "./recover-message-id";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";

export type ReplyRecipientsJson = { to?: { identifier?: string }[]; cc?: { identifier?: string }[] };

export type ReplyContext = {
  thread: {
    id: string;
    subject: string | null;
    unipileThreadId: string;
    connectedAccountId: string;
    messages: {
      unipileMessageId: string;
      subject: string | null;
      senderIdentifier: string | null;
      recipients: unknown;
      direction: string;
    }[];
  };
  credential: {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: boolean | null;
    username: string;
    sealedSecret: string;
    connectedAccount: { emailAddress: string | null; displayName: string | null };
  };
};

export abstract class SendReplyRepo {
  abstract findReplyContext(messagingThreadId: string): Promise<ReplyContext | null>;
  abstract storeOutboundReply(args: {
    messagingThreadId: string;
    connectedAccountId: string;
    storedMessageId: string;
    subject: string;
    body: string;
    senderIdentifier: string;
    recipients: string[];
    sentAt: Date;
  }): Promise<void>;
}

function identifiersOf(recipients: unknown, key: "to" | "cc"): string[] {
  const bag = (recipients ?? {}) as ReplyRecipientsJson;
  const entries = bag[key];
  if (!Array.isArray(entries)) return [];

  return entries.flatMap((entry) => (typeof entry?.identifier === "string" ? [entry.identifier] : []));
}

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.create,
})
export class SendReplyInteractor extends AuthenticatedInteractor<SendReplyData, SendReplyOutcome> {
  constructor(
    private repo: SendReplyRepo,
    private service: SendReplyService,
    private secretKey: SecretBoxKey | null,
    private now: () => Date,
  ) {
    super();
  }

  @Write({
    input: SendReplySchema,
    output: SendReplyOutcomeSchema,
  })
  async invoke(data: SendReplyData): Validated<SendReplyOutcome> {
    const secretKey = this.secretKey;
    if (!secretKey) return failUnavailable(CustomErrorCode.mailboxSecretKeyMissing);

    const context = await this.repo.findReplyContext(data.threadId);
    if (!context) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    const { credential, thread } = context;
    if (!credential.smtpHost || !credential.smtpPort)
      return failUnavailable(CustomErrorCode.mailboxSendingNotConfigured);

    const mailboxAddress = credential.connectedAccount.emailAddress ?? credential.username;
    const [latest] = thread.messages;
    const answered = recoverRfcMessageId(latest?.unipileMessageId);
    const root = recoverThreadRootMessageId(thread.unipileThreadId);

    const reply = buildReply({
      mailboxAddress,
      mailboxDisplayName: credential.connectedAccount.displayName,
      source: {
        messageId: answered,
        references: root && root !== answered ? root : null,
        subject: latest?.subject ?? thread.subject,
        senderIdentifier: latest?.direction === "outbound" ? null : (latest?.senderIdentifier ?? null),
        toIdentifiers: identifiersOf(latest?.recipients, "to"),
        ccIdentifiers: identifiersOf(latest?.recipients, "cc"),
      },
      body: data.body,
      replyAll: data.replyAll,
    });

    if (reply.to.length === 0) return await fail(CustomErrorCode.mailboxNoReplyRecipient, ["threadId"]);

    const secret = openSecret(secretKey, credential.sealedSecret);
    const imap = {
      host: credential.imapHost,
      port: credential.imapPort,
      secure: credential.imapSecure,
      username: credential.username,
      secret,
    };

    const sent = await this.service.send(
      {
        host: credential.smtpHost,
        port: credential.smtpPort,
        secure: credential.smtpSecure ?? true,
        username: credential.username,
        secret,
      },
      reply,
      imap,
    );

    const sentAt = this.now();
    await this.repo.storeOutboundReply({
      messagingThreadId: thread.id,
      connectedAccountId: thread.connectedAccountId,
      storedMessageId: `${STORED_MESSAGE_ID_PREFIX}${sent.messageId.replace(/^<|>$/g, "")}`,
      subject: reply.subject,
      body: data.body,
      senderIdentifier: mailboxAddress.toLowerCase(),
      recipients: sent.recipients,
      sentAt,
    });

    return {
      ok: true as const,
      data: { threadId: thread.id, messageId: sent.messageId, recipients: sent.recipients },
    };
  }
}
