import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import type { MailboxOAuthClient, MailboxOAuthProfile } from "./mailbox-oauth-providers";
import type { SecretBoxKey } from "../credentials/secret-box";

import { openSecret, sealSecret } from "../credentials/secret-box";

export type MailboxOAuthFetch = (input: string, init: RequestInit) => Promise<Response>;

export const MailboxOAuthFailure = {
  exchangeFailed: "exchangeFailed",
  refreshFailed: "refreshFailed",
  noRefreshToken: "noRefreshToken",
  noEmail: "noEmail",
} as const;

export type MailboxOAuthFailure = (typeof MailboxOAuthFailure)[keyof typeof MailboxOAuthFailure];

export class MailboxOAuthError extends Error {
  constructor(readonly failure: MailboxOAuthFailure) {
    super(failure);
    this.name = "MailboxOAuthError";
  }
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().positive().default(3600),
  id_token: z.string().min(1).optional(),
});

export const MailboxTokenBundleSchema = z.object({
  refreshToken: z.string().min(1),
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  calendarAccessToken: z.string().min(1).optional(),
  calendarExpiresAt: z.string().datetime().optional(),
});

export type MailboxTokenBundle = z.infer<typeof MailboxTokenBundleSchema>;

export type MailboxTokenGrant = { bundle: MailboxTokenBundle; idToken: string | null };

const REQUEST_TIMEOUT_MS = 15_000;

async function requestTokens(
  profile: MailboxOAuthProfile,
  client: MailboxOAuthClient,
  params: Record<string, string>,
  fetcher: MailboxOAuthFetch,
  failure: MailboxOAuthFailure,
): Promise<z.infer<typeof TokenResponseSchema>> {
  let response: Response;
  try {
    response = await fetcher(profile.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        ...params,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MailboxOAuthError(failure);
  }

  if (!response.ok) throw new MailboxOAuthError(failure);

  const parsed = TokenResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new MailboxOAuthError(failure);

  return parsed.data;
}

function expiresAtFrom(now: Date, expiresIn: number): string {
  return new Date(now.getTime() + expiresIn * 1000).toISOString();
}

export async function exchangeMailboxOAuthCode(args: {
  profile: MailboxOAuthProfile;
  client: MailboxOAuthClient;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetcher: MailboxOAuthFetch;
  now: Date;
}): Promise<MailboxTokenGrant> {
  const tokens = await requestTokens(
    args.profile,
    args.client,
    {
      grant_type: "authorization_code",
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri,
      ...(args.profile.separateCalendarToken ? { scope: args.profile.scopes.join(" ") } : {}),
    },
    args.fetcher,
    MailboxOAuthFailure.exchangeFailed,
  );
  if (!tokens.refresh_token) throw new MailboxOAuthError(MailboxOAuthFailure.noRefreshToken);

  return {
    bundle: {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: expiresAtFrom(args.now, tokens.expires_in),
    },
    idToken: tokens.id_token ?? null,
  };
}

export async function refreshMailboxAccessToken(args: {
  profile: MailboxOAuthProfile;
  client: MailboxOAuthClient;
  refreshToken: string;
  fetcher: MailboxOAuthFetch;
  now: Date;
  scopes?: readonly string[];
}): Promise<{ refreshToken: string; accessToken: string; expiresAt: string }> {
  const tokens = await requestTokens(
    args.profile,
    args.client,
    {
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
      scope: (args.scopes ?? args.profile.scopes).join(" "),
    },
    args.fetcher,
    MailboxOAuthFailure.refreshFailed,
  );

  return {
    refreshToken: tokens.refresh_token ?? args.refreshToken,
    accessToken: tokens.access_token,
    expiresAt: expiresAtFrom(args.now, tokens.expires_in),
  };
}

const IdTokenClaimsSchema = z.object({
  email: z.string().email().optional(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
});

export function mailboxIdentityFromIdToken(idToken: string | null): {
  emailAddress: string;
  displayName: string | null;
} {
  const payload = idToken?.split(".")[1];
  if (!payload) throw new MailboxOAuthError(MailboxOAuthFailure.noEmail);

  let claims: z.infer<typeof IdTokenClaimsSchema>;
  try {
    claims = IdTokenClaimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    throw new MailboxOAuthError(MailboxOAuthFailure.noEmail);
  }

  const emailAddress = claims.email ?? claims.preferred_username;
  if (!emailAddress || !z.string().email().safeParse(emailAddress).success)
    throw new MailboxOAuthError(MailboxOAuthFailure.noEmail);

  return { emailAddress: emailAddress.toLowerCase(), displayName: claims.name?.trim() || null };
}

export function sealMailboxTokenBundle(key: SecretBoxKey, bundle: MailboxTokenBundle): string {
  return sealSecret(key, JSON.stringify(bundle));
}

export function openMailboxTokenBundle(key: SecretBoxKey, sealed: string): MailboxTokenBundle {
  return MailboxTokenBundleSchema.parse(JSON.parse(openSecret(key, sealed)));
}

export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");

  return { codeVerifier, codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url") };
}
