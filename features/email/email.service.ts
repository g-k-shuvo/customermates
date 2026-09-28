import type React from "react";

import { env } from "@/env";
import { branding } from "@/core/config/branding";

import type { EmailReceipt, EmailTransport } from "./email-transport";
import { resolveEmailTransport } from "./email-transport";
import { ConsoleTransport } from "./console.transport";
import { ResendTransport } from "./resend.transport";
import { SmtpTransport } from "./smtp.transport";

type SendArgs = {
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

const defaultSender = `${branding.name} <${env.RESEND_OPERATOR_EMAIL}>`;

function selectTransport(): EmailTransport {
  const transport = resolveEmailTransport(env.EMAIL_TRANSPORT, env.NODE_ENV);
  if (transport === "smtp") return new SmtpTransport();
  if (transport === "console") return new ConsoleTransport();

  return new ResendTransport();
}

export class EmailService {
  async send(args: SendArgs): Promise<boolean> {
    return (await this.deliver(args)).accepted;
  }

  async deliver(args: SendArgs): Promise<EmailReceipt> {
    return selectTransport().deliver({ ...args, from: args.from ?? defaultSender });
  }
}
