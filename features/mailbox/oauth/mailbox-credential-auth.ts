import type { MailboxOAuthProvider } from "@/generated/prisma";
import type { SecretBoxKey } from "../credentials/secret-box";
import type { MailboxOAuthSettings } from "./mailbox-oauth-providers";
import type { MailboxAuthMethod } from "../sync/mailbox-transport";
import type { MailboxOAuthFetch, MailboxTokenBundle } from "./mailbox-oauth-tokens";

import { openSecret } from "../credentials/secret-box";
import { MailboxTransportError, MailboxTransportFailure } from "../sync/mailbox-transport";
import { mailboxOAuthClientFor, mailboxOAuthProfile } from "./mailbox-oauth-providers";
import { openMailboxTokenBundle, refreshMailboxAccessToken, sealMailboxTokenBundle } from "./mailbox-oauth-tokens";

export type MailboxAuthSource = {
  connectedAccountId: string;
  oauthProvider?: MailboxOAuthProvider | null;
  sealedSecret: string;
};

export type MailboxAuth = { secret: string; authMethod: MailboxAuthMethod };

export type MailboxTokenStore = {
  saveSealedSecret(connectedAccountId: string, sealedSecret: string): Promise<void>;
};

const REFRESH_MARGIN_MS = 2 * 60_000;

export class MailboxCredentialAuth {
  constructor(
    private secretKey: SecretBoxKey,
    private settings: MailboxOAuthSettings,
    private store: MailboxTokenStore,
    private fetcher: MailboxOAuthFetch,
    private now: () => Date,
  ) {}

  async resolve(source: MailboxAuthSource): Promise<MailboxAuth> {
    if (!source.oauthProvider)
      return { secret: openSecret(this.secretKey, source.sealedSecret), authMethod: "password" };

    const client = mailboxOAuthClientFor(source.oauthProvider, this.settings);
    if (!client) throw new MailboxTransportError(MailboxTransportFailure.authenticationFailed);

    const bundle = openMailboxTokenBundle(this.secretKey, source.sealedSecret);
    const now = this.now();
    if (Date.parse(bundle.expiresAt) - now.getTime() > REFRESH_MARGIN_MS)
      return { secret: bundle.accessToken, authMethod: "oauth" };

    let refreshed: MailboxTokenBundle;
    try {
      refreshed = {
        ...bundle,
        ...(await refreshMailboxAccessToken({
          profile: mailboxOAuthProfile(source.oauthProvider, this.settings),
          client,
          refreshToken: bundle.refreshToken,
          fetcher: this.fetcher,
          now,
        })),
      };
    } catch {
      throw new MailboxTransportError(MailboxTransportFailure.authenticationFailed);
    }

    await this.store.saveSealedSecret(source.connectedAccountId, sealMailboxTokenBundle(this.secretKey, refreshed));

    return { secret: refreshed.accessToken, authMethod: "oauth" };
  }

  async resolveCalendarToken(source: MailboxAuthSource): Promise<string | null> {
    if (!source.oauthProvider) return null;

    const profile = mailboxOAuthProfile(source.oauthProvider, this.settings);
    if (!profile.separateCalendarToken) return (await this.resolve(source)).secret;

    const client = mailboxOAuthClientFor(source.oauthProvider, this.settings);
    if (!client) throw new MailboxTransportError(MailboxTransportFailure.authenticationFailed);

    const bundle = openMailboxTokenBundle(this.secretKey, source.sealedSecret);
    const now = this.now();
    if (
      bundle.calendarAccessToken &&
      bundle.calendarExpiresAt &&
      Date.parse(bundle.calendarExpiresAt) - now.getTime() > REFRESH_MARGIN_MS
    )
      return bundle.calendarAccessToken;

    let calendar: { refreshToken: string; accessToken: string; expiresAt: string };
    try {
      calendar = await refreshMailboxAccessToken({
        profile,
        client,
        refreshToken: bundle.refreshToken,
        fetcher: this.fetcher,
        now,
        scopes: [...profile.calendarScopes, "offline_access"],
      });
    } catch {
      throw new MailboxTransportError(MailboxTransportFailure.authenticationFailed);
    }

    await this.store.saveSealedSecret(
      source.connectedAccountId,
      sealMailboxTokenBundle(this.secretKey, {
        ...bundle,
        refreshToken: calendar.refreshToken,
        calendarAccessToken: calendar.accessToken,
        calendarExpiresAt: calendar.expiresAt,
      }),
    );

    return calendar.accessToken;
  }
}

export async function resolveMailboxAuth(
  auth: MailboxCredentialAuth | null | undefined,
  secretKey: SecretBoxKey,
  source: MailboxAuthSource,
): Promise<MailboxAuth> {
  if (auth) return await auth.resolve(source);
  if (source.oauthProvider) throw new MailboxTransportError(MailboxTransportFailure.authenticationFailed);

  return { secret: openSecret(secretKey, source.sealedSecret), authMethod: "password" };
}
