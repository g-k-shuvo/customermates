import { render } from "@react-email/components";
import { createTransport } from "nodemailer";

import { env } from "@/env";
import { reportApplicationError } from "@/core/errors/report-application-error";

import type { EmailMessage, EmailTransport } from "./email-transport";

export class SmtpTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<boolean> {
    if (!env.EMAIL_SMTP_HOST) throw new Error("EMAIL_SMTP_HOST is not configured");

    const auth = env.EMAIL_SMTP_USER ? { user: env.EMAIL_SMTP_USER, pass: env.EMAIL_SMTP_PASSWORD ?? "" } : undefined;

    const transporter = createTransport({
      host: env.EMAIL_SMTP_HOST,
      port: env.EMAIL_SMTP_PORT,
      secure: env.EMAIL_SMTP_SECURE,
      auth,
    });

    const html = await render(message.react);

    const receipt = await transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html,
    });

    if (receipt.accepted.length === 0) {
      reportApplicationError(
        new Error(`SMTP accepted no recipient for a message to ${message.to} from ${message.from}`),
      );

      return false;
    }

    return true;
  }
}
