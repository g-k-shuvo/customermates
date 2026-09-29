import { randomBytes } from "node:crypto";

import type { Validated } from "@/core/validation/validation.utils";
import type { SecretBoxKey } from "../credentials/secret-box";
import type { MailboxOAuthSettings } from "../oauth/mailbox-oauth-providers";

import { Resource, Action } from "@/generated/prisma";

import {
  StartMailboxOAuthDtoSchema,
  StartMailboxOAuthSchema,
  type MailboxOAuthState,
  type StartMailboxOAuthData,
  type StartMailboxOAuthDto,
} from "../oauth/mailbox-oauth.schema";
import { mailboxOAuthClientFor, mailboxOAuthProfile, mailboxOAuthRedirectUri } from "../oauth/mailbox-oauth-providers";
import { createPkcePair } from "../oauth/mailbox-oauth-tokens";
import { sealSecret } from "../credentials/secret-box";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failUnavailable } from "@/core/validation/interactor-failure-server";

@TenantInteractor({
  resource: Resource.inboxMessages,
  action: Action.create,
})
export class StartMailboxOAuthInteractor extends AuthenticatedInteractor<StartMailboxOAuthData, StartMailboxOAuthDto> {
  constructor(
    private secretKey: SecretBoxKey | null,
    private settings: MailboxOAuthSettings,
    private now: () => Date,
  ) {
    super();
  }

  @Validate(StartMailboxOAuthSchema)
  @ValidateOutput(StartMailboxOAuthDtoSchema)
  async invoke(data: StartMailboxOAuthData): Validated<StartMailboxOAuthDto> {
    if (!this.secretKey) return await failUnavailable(CustomErrorCode.mailboxSecretKeyMissing);

    const client = mailboxOAuthClientFor(data.provider, this.settings);
    if (!client) return await failUnavailable(CustomErrorCode.mailboxOAuthNotConfigured, ["provider"]);

    const profile = mailboxOAuthProfile(data.provider, this.settings);
    const { codeVerifier, codeChallenge } = createPkcePair();
    const state: MailboxOAuthState = {
      provider: data.provider,
      state: randomBytes(24).toString("base64url"),
      codeVerifier,
      userId: this.userId,
      issuedAt: this.now().getTime(),
    };

    const authorizeUrl = new URL(profile.authorizeUrl);
    for (const [name, value] of Object.entries({
      client_id: client.clientId,
      redirect_uri: mailboxOAuthRedirectUri(data.provider, this.settings),
      response_type: "code",
      scope: [...profile.scopes, ...profile.calendarScopes].join(" "),
      state: state.state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...profile.authorizeParams,
    }))
      authorizeUrl.searchParams.set(name, value);

    return {
      ok: true as const,
      data: { authorizeUrl: authorizeUrl.toString(), sealedState: sealSecret(this.secretKey, JSON.stringify(state)) },
    };
  }
}
