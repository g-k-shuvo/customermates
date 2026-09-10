import { type ConnectMailboxData } from "../mailbox.schema";

export const MAILBOX_SMTP_STARTTLS_PORT = 587;
export const MAILBOX_SMTP_IMPLICIT_TLS_PORT = 465;

export type MailboxSmtpSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
};

export type SmtpSettingsInput = Pick<ConnectMailboxData, "smtpHost" | "smtpPort" | "smtpSecure">;

export function resolveSmtpSettings(input: SmtpSettingsInput): MailboxSmtpSettings {
  if (!input.smtpHost) return { smtpHost: null, smtpPort: null, smtpSecure: null };

  const smtpSecure = input.smtpSecure ?? false;
  const defaultPort = smtpSecure ? MAILBOX_SMTP_IMPLICIT_TLS_PORT : MAILBOX_SMTP_STARTTLS_PORT;

  return { smtpHost: input.smtpHost, smtpPort: input.smtpPort ?? defaultPort, smtpSecure };
}
