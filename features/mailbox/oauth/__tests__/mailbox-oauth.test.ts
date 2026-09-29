import { describe, expect, it, vi } from "vitest";

import type { MailboxOAuthFetch } from "../mailbox-oauth-tokens";

import { parseSecretBoxKey, sealSecret } from "../../credentials/secret-box";
import { MailboxTransportError } from "../../sync/mailbox-transport";
import { MailboxCredentialAuth, resolveMailboxAuth } from "../mailbox-credential-auth";
import {
  configuredMailboxOAuthProviders,
  mailboxOAuthProfile,
  mailboxOAuthRedirectUri,
  mailboxOAuthSettingsFrom,
} from "../mailbox-oauth-providers";
import {
  exchangeMailboxOAuthCode,
  mailboxIdentityFromIdToken,
  MailboxOAuthError,
  openMailboxTokenBundle,
  refreshMailboxAccessToken,
  sealMailboxTokenBundle,
} from "../mailbox-oauth-tokens";

const KEY = parseSecretBoxKey(Buffer.alloc(32, 7).toString("base64"));
const NOW = new Date("2026-10-01T09:00:00Z");

const SETTINGS = mailboxOAuthSettingsFrom({
  MAILBOX_GOOGLE_CLIENT_ID: "google-client",
  MAILBOX_GOOGLE_CLIENT_SECRET: "google-secret",
  MAILBOX_MICROSOFT_CLIENT_ID: "",
  MAILBOX_MICROSOFT_CLIENT_SECRET: "ms-secret",
  MAILBOX_MICROSOFT_TENANT: "contoso.onmicrosoft.com",
  BASE_URL: "https://crm.example.com",
});

function idToken(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

function tokenEndpoint(body: unknown, status = 200) {
  return vi.fn<MailboxOAuthFetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

function formOf(fetcher: ReturnType<typeof tokenEndpoint>): URLSearchParams {
  return new URLSearchParams(String(fetcher.mock.calls[0]?.[1].body));
}

describe("mailbox OAuth settings", () => {
  it("offers only the providers with both a client id and a secret", () => {
    expect(configuredMailboxOAuthProviders(SETTINGS)).toEqual(["google"]);
  });

  it("points the callback at this instance and Microsoft at the configured tenant", () => {
    expect(mailboxOAuthRedirectUri("google", SETTINGS)).toBe(
      "https://crm.example.com/api/mailbox/oauth/google/callback",
    );
    expect(mailboxOAuthProfile("microsoft", SETTINGS).tokenUrl).toBe(
      "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token",
    );
    expect(mailboxOAuthProfile("microsoft", SETTINGS).smtp).toEqual({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
    });
  });
});

describe("mailbox OAuth tokens", () => {
  const profile = mailboxOAuthProfile("google", SETTINGS);
  const client = { clientId: "google-client", clientSecret: "google-secret" };

  it("exchanges a code with its PKCE verifier and keeps the refresh token", async () => {
    const fetcher = tokenEndpoint({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3599, id_token: "x" });

    const grant = await exchangeMailboxOAuthCode({
      profile,
      client,
      code: "code-1",
      codeVerifier: "verifier-1",
      redirectUri: "https://crm.example.com/cb",
      fetcher,
      now: NOW,
    });

    expect(grant.bundle).toEqual({ refreshToken: "rt-1", accessToken: "at-1", expiresAt: "2026-10-01T09:59:59.000Z" });
    expect(Object.fromEntries(formOf(fetcher))).toMatchObject({
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "verifier-1",
      client_id: "google-client",
    });
  });

  it("refuses a grant without a refresh token, and a failed exchange", async () => {
    const base = { profile, client, code: "c", codeVerifier: "v", redirectUri: "https://x.test/cb", now: NOW };

    await expect(exchangeMailboxOAuthCode({ ...base, fetcher: tokenEndpoint({ access_token: "a" }) })).rejects.toThrow(
      new MailboxOAuthError("noRefreshToken"),
    );
    await expect(
      exchangeMailboxOAuthCode({ ...base, fetcher: tokenEndpoint({ error: "invalid_grant" }, 400) }),
    ).rejects.toThrow(new MailboxOAuthError("exchangeFailed"));
  });

  it("keeps the old refresh token when the provider does not rotate it, and takes a rotated one", async () => {
    const kept = await refreshMailboxAccessToken({
      profile,
      client,
      refreshToken: "rt-1",
      fetcher: tokenEndpoint({ access_token: "at-2" }),
      now: NOW,
    });
    const rotated = await refreshMailboxAccessToken({
      profile,
      client,
      refreshToken: "rt-1",
      fetcher: tokenEndpoint({ access_token: "at-3", refresh_token: "rt-2" }),
      now: NOW,
    });

    expect(kept.refreshToken).toBe("rt-1");
    expect(rotated.refreshToken).toBe("rt-2");
  });

  it("reads the mailbox address from the id token, falling back to Microsoft's preferred_username", () => {
    expect(mailboxIdentityFromIdToken(idToken({ email: "Ada@Example.com", name: "Ada" }))).toEqual({
      emailAddress: "ada@example.com",
      displayName: "Ada",
    });
    expect(mailboxIdentityFromIdToken(idToken({ preferred_username: "ben@contoso.com" })).emailAddress).toBe(
      "ben@contoso.com",
    );
    expect(() => mailboxIdentityFromIdToken(idToken({ preferred_username: "not-an-address" }))).toThrow(
      new MailboxOAuthError("noEmail"),
    );
    expect(() => mailboxIdentityFromIdToken(null)).toThrow(new MailboxOAuthError("noEmail"));
  });
});

describe("MailboxCredentialAuth", () => {
  const source = (bundle: { accessToken: string; expiresAt: string }) => ({
    connectedAccountId: "account-1",
    oauthProvider: "google" as const,
    sealedSecret: sealMailboxTokenBundle(KEY, { refreshToken: "rt-1", ...bundle }),
  });

  function harness(fetcher: MailboxOAuthFetch = tokenEndpoint({ access_token: "fresh", expires_in: 3600 })) {
    const saveSealedSecret = vi.fn<(id: string, sealed: string) => Promise<void>>(() => Promise.resolve());
    const auth = new MailboxCredentialAuth(KEY, SETTINGS, { saveSealedSecret }, fetcher, () => NOW);

    return { auth, saveSealedSecret };
  }

  it("opens a password credential as before", async () => {
    const { auth } = harness();

    await expect(
      auth.resolve({ connectedAccountId: "a", oauthProvider: null, sealedSecret: sealSecret(KEY, "app-password") }),
    ).resolves.toEqual({ secret: "app-password", authMethod: "password" });
  });

  it("uses a stored access token that is still valid without calling the provider", async () => {
    const fetcher = tokenEndpoint({});
    const { auth, saveSealedSecret } = harness(fetcher);

    const resolved = await auth.resolve(source({ accessToken: "stored", expiresAt: "2026-10-01T09:30:00Z" }));

    expect(resolved).toEqual({ secret: "stored", authMethod: "oauth" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(saveSealedSecret).not.toHaveBeenCalled();
  });

  it("refreshes a token about to expire and stores the new bundle sealed", async () => {
    const { auth, saveSealedSecret } = harness();

    const resolved = await auth.resolve(source({ accessToken: "stale", expiresAt: "2026-10-01T09:01:00Z" }));

    expect(resolved).toEqual({ secret: "fresh", authMethod: "oauth" });
    const [accountId, sealed] = saveSealedSecret.mock.calls[0] ?? [];
    expect(accountId).toBe("account-1");
    expect(openMailboxTokenBundle(KEY, String(sealed))).toEqual({
      refreshToken: "rt-1",
      accessToken: "fresh",
      expiresAt: "2026-10-01T10:00:00.000Z",
    });
  });

  it("reports a revoked grant or an unconfigured provider as an authentication failure", async () => {
    const { auth } = harness(tokenEndpoint({ error: "invalid_grant" }, 400));
    const expired = source({ accessToken: "stale", expiresAt: "2026-10-01T08:00:00Z" });

    await expect(auth.resolve(expired)).rejects.toThrow(MailboxTransportError);
    await expect(auth.resolve({ ...expired, oauthProvider: "microsoft" })).rejects.toThrow(MailboxTransportError);
    await expect(resolveMailboxAuth(undefined, KEY, expired)).rejects.toThrow(MailboxTransportError);
  });
});
