import { Resend } from "resend";

import { env } from "@/env";

import type { EmailMessage, EmailTransport } from "./email-transport";

export class ResendTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<boolean> {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      react: message.react,
    });

    return error === null;
  }
}
