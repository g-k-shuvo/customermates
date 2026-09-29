import { timingSafeEqual } from "node:crypto";

import type { ConnectMailboxRepo } from "./connect-mailbox.repo";
import type { MailboxTransport } from "../sync/mailbox-transport";
import type { SecretBoxKey } from "../credentials/secret-box";
import type { MailboxOAuthSettings } from "../oauth/mailbox-oauth-providers";
import type { MailboxOAuthFetch, MailboxTokenGrant } from "../oauth/mailbox-oauth-tokens";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { MailboxCredentialDtoSchema, type MailboxCredentialDto } from "../mailbox.schema";
import {
  ConnectOAuthMailboxSchema,
  MAILBOX_OAUTH_STATE_TTL_MS,
  MailboxOAuthStateSchema,
  type ConnectOAuthMailboxData,
  type MailboxOAuthState,
} from "../oauth/mailbox-oauth.schema";
import { mailboxOAuthClientFor, mailboxOAuthProfile, mailboxOAuthRedirectUri } from "../oauth/mailbox-oauth-providers";
import {
  exchangeMailboxOAuthCode,
  mailboxIdentityFromIdToken,
  MailboxOAuthError,
  sealMailboxTokenBundle,
} from "../oauth/mailbox-oauth-tokens";
import { MailboxTransportError } from "../sync/mailbox-transport";
import { openSecret } from "../credentials/secret-box";
import { FAILURE_CODES } from "./connect-mailbox.interactor";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failConflict, failUnavailable } from "@/core/validation/interactor-failure-server";

const DAY_MS = 24 * 60 * 60 * 1000;

function sameText(left: string, right: string): boolean {
  const a = new Uint8Array(Buffer.from(left));
  const b = new Uint8Array(Buffer.from(right));

  return a.length === b.length && timingSafeEqual(a, b);
}

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.create,
})
export class ConnectOAuthMailboxInteractor extends AuthenticatedInteractor<
  ConnectOAuthMailboxData,
  MailboxCredentialDto
> {
  constructor(
    private repo: ConnectMailboxRepo,
    private transport: MailboxTransport,
    private secretKey: SecretBoxKey | null,
    private settings: MailboxOAuthSettings,
    private fetcher: MailboxOAuthFetch,
    private now: () => Date,
  ) {
    super();
  }

  private openState(sealedState: string): MailboxOAuthState | null {
    if (!this.secretKey) return null;

    try {
      return MailboxOAuthStateSchema.parse(JSON.parse(openSecret(this.secretKey, sealedState)));
    } catch {
      return null;
    }
  }

  @Write({
    input: ConnectOAuthMailboxSchema,
    output: MailboxCredentialDtoSchema,
  })
  async invoke(data: ConnectOAuthMailboxData): Validated<MailboxCredentialDto> {
    if (!this.secretKey) return failUnavailable(CustomErrorCode.mailboxSecretKeyMissing);

    const client = mailboxOAuthClientFor(data.provider, this.settings);
    if (!client) return failUnavailable(CustomErrorCode.mailboxOAuthNotConfigured, ["provider"]);

    const now = this.now();
    const state = this.openState(data.sealedState);
    if (
      !state ||
      state.provider !== data.provider ||
      state.userId !== this.userId ||
      !sameText(state.state, data.state) ||
      now.getTime() - state.issuedAt > MAILBOX_OAUTH_STATE_TTL_MS
    )
      return await fail(CustomErrorCode.mailboxOAuthFailed, ["state"]);

    const profile = mailboxOAuthProfile(data.provider, this.settings);

    let grant: MailboxTokenGrant;
    let identity: { emailAddress: string; displayName: string | null };
    try {
      grant = await exchangeMailboxOAuthCode({
        profile,
        client,
        code: data.code,
        codeVerifier: state.codeVerifier,
        redirectUri: mailboxOAuthRedirectUri(data.provider, this.settings),
        fetcher: this.fetcher,
        now,
      });
      identity = mailboxIdentityFromIdToken(grant.idToken);
    } catch (error) {
      if (error instanceof MailboxOAuthError) return await fail(CustomErrorCode.mailboxOAuthFailed, ["code"]);

      throw error;
    }

    const existing = await this.repo.findMailboxByAddress(identity.emailAddress);
    if (existing) return failConflict(CustomErrorCode.mailboxAlreadyConnected, ["emailAddress"]);

    try {
      await this.transport.verify({
        ...profile.imap,
        username: identity.emailAddress,
        secret: grant.bundle.accessToken,
        authMethod: "oauth",
      });
    } catch (error) {
      if (error instanceof MailboxTransportError) return await fail(FAILURE_CODES[error.failure], ["provider"]);

      return await fail(CustomErrorCode.mailboxProtocolFailed, ["provider"]);
    }

    const mailbox = await this.repo.createMailboxOrThrow({
      emailAddress: identity.emailAddress,
      displayName: identity.displayName,
      imapHost: profile.imap.host,
      imapPort: profile.imap.port,
      imapSecure: profile.imap.secure,
      username: identity.emailAddress,
      sealedSecret: sealMailboxTokenBundle(this.secretKey, grant.bundle),
      oauthProvider: data.provider,
      smtpHost: profile.smtp.host,
      smtpPort: profile.smtp.port,
      smtpSecure: profile.smtp.secure,
      backfillFrom: new Date(now.getTime() - data.backfillDays * DAY_MS),
      verifiedAt: now,
    });

    return { ok: true as const, data: mailbox };
  }
}
