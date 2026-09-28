import type React from "react";

export const EMAIL_TRANSPORTS = ["resend", "smtp", "console"] as const;

export type EmailTransportName = (typeof EMAIL_TRANSPORTS)[number];

export type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  react: React.ReactElement<Record<string, unknown>>;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type EmailReceipt = {
  accepted: boolean;
  transport: EmailTransportName;
  providerMessageId: string | null;
};

export type EmailTransport = {
  deliver(message: EmailMessage): Promise<EmailReceipt>;
};

export function resolveEmailTransport(value: string | undefined, nodeEnv: string | undefined): EmailTransportName {
  const configured = value?.trim();
  if (!configured) return nodeEnv === "production" ? "resend" : "console";
  if ((EMAIL_TRANSPORTS as readonly string[]).includes(configured)) return configured as EmailTransportName;

  throw new Error(`EMAIL_TRANSPORT must be one of ${EMAIL_TRANSPORTS.join(", ")}`);
}
