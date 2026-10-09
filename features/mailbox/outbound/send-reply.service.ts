import { randomUUID } from "node:crypto";

import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

import type { BuiltReply } from "./build-reply";
import type { MailboxAuthMethod, MailboxConnection, MailboxTransport } from "../sync/mailbox-transport";
import type { AddressLookup } from "../sync/resolve-imap-address";

import { classifyImapError } from "../sync/imapflow.transport";
import { MailboxTransportError, MailboxTransportFailure } from "../sync/mailbox-transport";
import { pinImapTarget } from "../sync/resolve-imap-address";

export type SmtpDelivery = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  secret: string;
  authMethod?: MailboxAuthMethod;
};

export type PinnedSmtpDelivery = SmtpDelivery & { servername: string };

export type SendReplyServiceOptions = {
  allowPrivateHosts?: boolean;
  resolveAddresses?: AddressLookup;
};

export type SentReply = {
  messageId: string;
  raw: Buffer;
  recipients: string[];
};

export type DeliveredReply = SentReply & { sentCopySaved: boolean };

const SELF_FILING_IMAP_HOSTS =
  /(^|\.)(gmail\.com|googlemail\.com|office365\.com|outlook\.com|hotmail\.com|live\.com)$/i;

export function filesSentMailItself(imapHost: string): boolean {
  return SELF_FILING_IMAP_HOSTS.test(imapHost.trim());
}

const SMTP_FAILURES: Record<string, MailboxTransportFailure> = {
  EAUTH: MailboxTransportFailure.authenticationFailed,
  EDNS: MailboxTransportFailure.unresolvableHost,
  ETLS: MailboxTransportFailure.tlsFailed,
};

const REFUSED_MESSAGE = /econnrefused|ehostunreach|enetunreach|econnreset/i;

export function classifySmtpError(error: unknown): MailboxTransportError {
  if (error instanceof MailboxTransportError) return error;

  const code = (error as { code?: unknown })?.code;
  const known = typeof code === "string" ? SMTP_FAILURES[code] : undefined;
  if (known) return new MailboxTransportError(known);
  if (error instanceof Error && REFUSED_MESSAGE.test(error.message))
    return new MailboxTransportError(MailboxTransportFailure.connectionRefused);

  return new MailboxTransportError(classifyImapError(error));
}

export type ReplyMailer = (delivery: PinnedSmtpDelivery, reply: BuiltReply, messageId: string) => Promise<SentReply>;

export function messageIdFor(address: string): string {
  const domain = address.split("@")[1] ?? "localhost";

  return `<${randomUUID()}@${domain}>`;
}

async function composeRaw(reply: BuiltReply, messageId: string): Promise<Buffer> {
  const composer = new MailComposer({
    from: reply.from,
    to: reply.to,
    cc: reply.cc.length > 0 ? reply.cc : undefined,
    subject: reply.subject,
    text: reply.text,
    messageId,
    inReplyTo: reply.inReplyTo ?? undefined,
    references: reply.references.length > 0 ? reply.references : undefined,
    attachments: reply.attachments?.map(({ filename, contentType, content }) => ({ filename, contentType, content })),
  });

  return await composer.compile().build();
}

const nodemailerMailer: ReplyMailer = async (delivery, reply, messageId) => {
  const raw = await composeRaw(reply, messageId);
  const transporter = nodemailer.createTransport({
    host: delivery.host,
    port: delivery.port,
    secure: delivery.secure,
    requireTLS: !delivery.secure,
    servername: delivery.servername,
    auth:
      delivery.authMethod === "oauth"
        ? { type: "OAuth2", user: delivery.username, accessToken: delivery.secret }
        : { user: delivery.username, pass: delivery.secret },
  });

  const recipients = [...reply.to, ...reply.cc];

  await transporter.sendMail({ envelope: { from: delivery.username, to: recipients }, raw });

  return { messageId, raw, recipients };
};

export class SendReplyService {
  constructor(
    private transport: MailboxTransport,
    private mailer: ReplyMailer = nodemailerMailer,
    private options: SendReplyServiceOptions = {},
  ) {}

  async send(delivery: SmtpDelivery, reply: BuiltReply, imap: MailboxConnection): Promise<DeliveredReply> {
    const target = await pinImapTarget(delivery.host, this.options.resolveAddresses, {
      allowPrivateHosts: this.options.allowPrivateHosts,
    });

    const sent = await this.mailer(
      { ...delivery, host: target.address, servername: target.servername },
      reply,
      messageIdFor(delivery.username),
    ).catch((error: unknown) => {
      throw classifySmtpError(error);
    });

    const sentCopySaved = filesSentMailItself(imap.host)
      ? true
      : await this.transport.appendToSent(imap, sent.raw, null, sent.messageId).then(
          () => true,
          () => false,
        );

    return { ...sent, sentCopySaved };
  }
}
