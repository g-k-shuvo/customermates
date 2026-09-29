import { MailboxOAuthProvider } from "@/generated/prisma";

export type MailboxOAuthClient = { clientId: string; clientSecret: string };

export type MailboxOAuthSettings = {
  clients: Partial<Record<MailboxOAuthProvider, MailboxOAuthClient>>;
  microsoftTenant: string;
  baseUrl: string;
};

export type MailboxServerEndpoint = { host: string; port: number; secure: boolean };

export type MailboxOAuthProfile = {
  provider: MailboxOAuthProvider;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: readonly string[];
  calendarScopes: readonly string[];
  separateCalendarToken: boolean;
  authorizeParams: Readonly<Record<string, string>>;
  imap: MailboxServerEndpoint;
  smtp: MailboxServerEndpoint;
};

const DEFAULT_MICROSOFT_TENANT = "common";

export function mailboxOAuthProfile(
  provider: MailboxOAuthProvider,
  settings: MailboxOAuthSettings,
): MailboxOAuthProfile {
  if (provider === MailboxOAuthProvider.google) {
    return {
      provider,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email", "https://mail.google.com/"],
      calendarScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      separateCalendarToken: false,
      authorizeParams: { access_type: "offline", prompt: "consent" },
      imap: { host: "imap.gmail.com", port: 993, secure: true },
      smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    };
  }

  const tenant = encodeURIComponent(settings.microsoftTenant.trim() || DEFAULT_MICROSOFT_TENANT);

  return {
    provider,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scopes: [
      "openid",
      "email",
      "offline_access",
      "https://outlook.office.com/IMAP.AccessAsUser.All",
      "https://outlook.office.com/SMTP.Send",
    ],
    calendarScopes: ["https://graph.microsoft.com/Calendars.Read"],
    separateCalendarToken: true,
    authorizeParams: { prompt: "select_account" },
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
  };
}

export function mailboxOAuthClientFor(
  provider: MailboxOAuthProvider,
  settings: MailboxOAuthSettings,
): MailboxOAuthClient | null {
  const client = settings.clients[provider];

  return client?.clientId && client.clientSecret ? client : null;
}

export function configuredMailboxOAuthProviders(settings: MailboxOAuthSettings): MailboxOAuthProvider[] {
  return Object.values(MailboxOAuthProvider).filter((provider) => mailboxOAuthClientFor(provider, settings) !== null);
}

export function mailboxOAuthRedirectUri(provider: MailboxOAuthProvider, settings: MailboxOAuthSettings): string {
  return new URL(`/api/mailbox/oauth/${provider}/callback`, settings.baseUrl).toString();
}

export function mailboxOAuthSettingsFrom(source: {
  MAILBOX_GOOGLE_CLIENT_ID?: string;
  MAILBOX_GOOGLE_CLIENT_SECRET?: string;
  MAILBOX_MICROSOFT_CLIENT_ID?: string;
  MAILBOX_MICROSOFT_CLIENT_SECRET?: string;
  MAILBOX_MICROSOFT_TENANT?: string;
  BASE_URL: string;
}): MailboxOAuthSettings {
  const client = (clientId?: string, clientSecret?: string) =>
    clientId?.trim() && clientSecret?.trim()
      ? { clientId: clientId.trim(), clientSecret: clientSecret.trim() }
      : undefined;

  return {
    clients: {
      google: client(source.MAILBOX_GOOGLE_CLIENT_ID, source.MAILBOX_GOOGLE_CLIENT_SECRET),
      microsoft: client(source.MAILBOX_MICROSOFT_CLIENT_ID, source.MAILBOX_MICROSOFT_CLIENT_SECRET),
    },
    microsoftTenant: source.MAILBOX_MICROSOFT_TENANT?.trim() || DEFAULT_MICROSOFT_TENANT,
    baseUrl: source.BASE_URL,
  };
}
