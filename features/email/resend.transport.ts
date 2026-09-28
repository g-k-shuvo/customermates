import { Resend } from "resend";

import { env } from "@/env";
import { reportApplicationError } from "@/core/errors/report-application-error";

import type { EmailMessage, EmailReceipt, EmailTransport } from "./email-transport";

export class ResendTransport implements EmailTransport {
  async deliver(message: EmailMessage): Promise<EmailReceipt> {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      react: message.react,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    });

    if (error) {
      reportApplicationError(
        new Error(`Resend rejected a message to ${message.to} from ${message.from}: ${error.name}: ${error.message}`),
      );

      return { accepted: false, transport: "resend", providerMessageId: null };
    }

    return { accepted: true, transport: "resend", providerMessageId: data?.id ?? null };
  }
}
