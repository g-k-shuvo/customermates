import type React from "react";

import { env } from "@/env";
import { branding } from "@/core/config/branding";

import type { EmailTransport } from "./email-transport";
import { ResendTransport } from "./resend.transport";
import { SmtpTransport } from "./smtp.transport";

type SendArgs = {
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
  from?: string;
};

const defaultSender = `${branding.name} <${env.RESEND_OPERATOR_EMAIL}>`;

function selectTransport(): EmailTransport {
  return env.EMAIL_TRANSPORT === "smtp" ? new SmtpTransport() : new ResendTransport();
}

export class EmailService {
  async send(args: SendArgs): Promise<boolean> {
    if (env.NODE_ENV !== "production") {
      console.log("[EmailService] EMAIL (local only)", {
        from: args.from ?? defaultSender,
        to: args.to,
        subject: args.subject,
        props: args.react.props,
      });

      return true;
    }

    return selectTransport().send({
      from: args.from ?? defaultSender,
      to: args.to,
      subject: args.subject,
      react: args.react,
    });
  }
}
