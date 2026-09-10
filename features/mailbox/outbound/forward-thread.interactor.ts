import type { Validated } from "@/core/validation/validation.utils";
import type { SecretBoxKey } from "../credentials/secret-box";
import type { SendReplyService, SentReply } from "./send-reply.service";

import { Resource, Action } from "@/generated/prisma";

import { ForwardThreadSchema, SendReplyOutcomeSchema } from "../mailbox.schema";
import { type ForwardThreadData, type SendReplyOutcome } from "../mailbox.schema";
import { MailboxTransportError, MailboxTransportFailure } from "../sync/mailbox-transport";
import { buildForward } from "./build-forward";
import { openSecret } from "../credentials/secret-box";
import { STORED_MESSAGE_ID_PREFIX } from "./recover-message-id";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";

export type ForwardRecipientsJson = { to?: { identifier?: string }[]; cc?: { identifier?: string }[] };

export type ForwardSourceRow = {
  subject: string | null;
  sender: unknown;
  senderIdentifier: string | null;
  recipients: unknown;
  bodyText: string | null;
  sentAt: Date;
};

export type ForwardContext = {
  thread: {
    id: string;
    subject: string | null;
    connectedAccountId: string;
    messages: ForwardSourceRow[];
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

export abstract class ForwardThreadRepo {
  abstract findReplyContext(messagingThreadId: string): Promise<ForwardContext | null>;
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
  const bag = (recipients ?? {}) as ForwardRecipientsJson;
  const entries = bag[key];
  if (!Array.isArray(entries)) return [];

  return entries.flatMap((entry) => (typeof entry?.identifier === "string" ? [entry.identifier] : []));
}

function displayNameOf(sender: unknown): string | null {
  const value = (sender ?? {}) as { displayName?: unknown };

  return typeof value.displayName === "string" ? value.displayName : null;
}

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.create,
})
export class ForwardThreadInteractor extends AuthenticatedInteractor<ForwardThreadData, SendReplyOutcome> {
  constructor(
    private repo: ForwardThreadRepo,
    private service: SendReplyService,
    private secretKey: SecretBoxKey | null,
    private now: () => Date,
  ) {
    super();
  }

  @Write({
    input: ForwardThreadSchema,
    output: SendReplyOutcomeSchema,
    tx: false,
  })
  async invoke(data: ForwardThreadData): Validated<SendReplyOutcome> {
    const secretKey = this.secretKey;
    if (!secretKey) return failUnavailable(CustomErrorCode.mailboxSecretKeyMissing);

    const context = await this.repo.findReplyContext(data.threadId);
    if (!context) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    const { credential, thread } = context;
    if (!credential.smtpHost || !credential.smtpPort)
      return failUnavailable(CustomErrorCode.mailboxSendingNotConfigured);

    const mailboxAddress = credential.connectedAccount.emailAddress ?? credential.username;
    const [latest] = thread.messages;

    const forward = buildForward({
      mailboxAddress,
      mailboxDisplayName: credential.connectedAccount.displayName,
      recipients: data.to,
      source: {
        subject: latest?.subject ?? thread.subject,
        senderIdentifier: latest?.senderIdentifier ?? null,
        senderDisplayName: displayNameOf(latest?.sender),
        toIdentifiers: identifiersOf(latest?.recipients, "to"),
        ccIdentifiers: identifiersOf(latest?.recipients, "cc"),
        sentAt: latest?.sentAt ?? null,
        bodyText: latest?.bodyText ?? null,
      },
      body: data.body,
    });

    if (forward.to.length === 0) return await fail(CustomErrorCode.mailboxNoReplyRecipient, ["to"]);

    const secret = openSecret(secretKey, credential.sealedSecret);
    const imap = {
      host: credential.imapHost,
      port: credential.imapPort,
      secure: credential.imapSecure,
      username: credential.username,
      secret,
    };

    let sent: SentReply;
    try {
      sent = await this.service.send(
        {
          host: credential.smtpHost,
          port: credential.smtpPort,
          secure: credential.smtpSecure ?? true,
          username: credential.username,
          secret,
        },
        forward,
        imap,
      );
    } catch (error) {
      if (error instanceof MailboxTransportError && error.failure === MailboxTransportFailure.hostRejected)
        return await fail(CustomErrorCode.mailboxHostRejected, ["threadId"]);

      throw error;
    }

    const sentAt = this.now();
    await this.repo.storeOutboundReply({
      messagingThreadId: thread.id,
      connectedAccountId: thread.connectedAccountId,
      storedMessageId: `${STORED_MESSAGE_ID_PREFIX}${sent.messageId.replace(/^<|>$/g, "")}`,
      subject: forward.subject,
      body: forward.text,
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
