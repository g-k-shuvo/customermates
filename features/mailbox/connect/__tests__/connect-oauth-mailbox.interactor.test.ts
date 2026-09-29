import { describe, it, expect, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import type { InteractorOutcome } from "@/core/validation/validation.utils";
import type { MailboxOAuthFetch } from "../../oauth/mailbox-oauth-tokens";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { ConnectOAuthMailboxInteractor } from "../connect-oauth-mailbox.interactor";
import { StartMailboxOAuthInteractor } from "../start-mailbox-oauth.interactor";
import { parseSecretBoxKey, sealSecret } from "../../credentials/secret-box";
import { mailboxOAuthSettingsFrom } from "../../oauth/mailbox-oauth-providers";
import { openMailboxTokenBundle } from "../../oauth/mailbox-oauth-tokens";
import { MailboxTransportError } from "../../sync/mailbox-transport";

type Issue = { params?: { error?: CustomErrorCode }; path?: (string | number)[] };

function codesOf(result: InteractorOutcome<unknown>): (CustomErrorCode | undefined)[] {
  return result.ok ? [] : (result.error.issues as Issue[]).map((issue) => issue.params?.error);
}

const KEY = parseSecretBoxKey(Buffer.alloc(32, 5).toString("base64"));
const ISSUED = new Date("2026-10-01T09:00:00Z");
const SETTINGS = mailboxOAuthSettingsFrom({
  MAILBOX_MICROSOFT_CLIENT_ID: "ms-client",
  MAILBOX_MICROSOFT_CLIENT_SECRET: "ms-secret",
  BASE_URL: "https://crm.example.com",
});

const ID_TOKEN = `h.${Buffer.from(JSON.stringify({ preferred_username: "Ana@Contoso.com", name: "Ana Diaz" })).toString("base64url")}.s`;

function tokenEndpoint(
  body: unknown = { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, id_token: ID_TOKEN },
  status = 200,
) {
  return vi.fn<MailboxOAuthFetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

async function started() {
  const result = await new StartMailboxOAuthInteractor(KEY, SETTINGS, () => ISSUED).invoke({ provider: "microsoft" });
  if (!result.ok) throw new Error("start failed");

  const url = new URL(result.data.authorizeUrl);

  return { url, state: url.searchParams.get("state") ?? "", sealedState: result.data.sealedState };
}

function harness(
  options: {
    fetcher?: ReturnType<typeof tokenEndpoint>;
    verify?: () => Promise<void>;
    existing?: unknown;
    now?: Date;
  } = {},
) {
  const createMailboxOrThrow = vi.fn().mockImplementation((args: { emailAddress: string }) =>
    Promise.resolve({
      id: "00000000-0000-4000-8000-0000000000d1",
      connectedAccountId: "00000000-0000-4000-8000-0000000000d2",
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapSecure: true,
      username: args.emailAddress,
      syncCursors: [],
      backfillFrom: new Date("2026-07-03T09:00:00Z"),
      lastSyncedAt: null,
      lastVerifiedAt: ISSUED,
    }),
  );
  const repo = {
    findMailboxByAddress: vi.fn().mockResolvedValue(options.existing ?? null),
    createMailboxOrThrow,
  } as never;
  const verify = vi.fn(options.verify ?? (() => Promise.resolve()));
  const fetcher = options.fetcher ?? tokenEndpoint();
  const now = options.now ?? new Date(ISSUED.getTime() + 60_000);

  return {
    interactor: new ConnectOAuthMailboxInteractor(repo, { verify } as never, KEY, SETTINGS, fetcher, () => now),
    createMailboxOrThrow,
    verify,
    fetcher,
  };
}

describe("StartMailboxOAuthInteractor", () => {
  it("builds a PKCE authorization request for the configured provider", async () => {
    const { url } = await started();

    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("ms-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://crm.example.com/api/mailbox/oauth/microsoft/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("scope")).toContain("https://outlook.office.com/IMAP.AccessAsUser.All");
  });

  it("refuses a provider that has no client configured", async () => {
    const result = await new StartMailboxOAuthInteractor(KEY, SETTINGS, () => ISSUED).invoke({ provider: "google" });

    expect(codesOf(result)).toEqual([CustomErrorCode.mailboxOAuthNotConfigured]);
  });
});

describe("ConnectOAuthMailboxInteractor", () => {
  it("exchanges the code, verifies IMAP with the token and stores the sealed grant", async () => {
    const { state, sealedState, url } = await started();
    const { interactor, createMailboxOrThrow, verify, fetcher } = harness();

    const result = await interactor.invoke({
      provider: "microsoft",
      code: "auth-code",
      state,
      sealedState,
      backfillDays: 90,
    });

    expect(result.ok).toBe(true);
    const form = new URLSearchParams(String(fetcher.mock.calls[0]?.[1].body));
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("code_verifier")).toBeTruthy();
    expect(url.searchParams.get("code_challenge")).not.toBe(form.get("code_verifier"));
    expect(verify).toHaveBeenCalledWith({
      host: "outlook.office365.com",
      port: 993,
      secure: true,
      username: "ana@contoso.com",
      secret: "at-1",
      authMethod: "oauth",
    });

    const args = createMailboxOrThrow.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args).toMatchObject({
      emailAddress: "ana@contoso.com",
      displayName: "Ana Diaz",
      oauthProvider: "microsoft",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: false,
    });
    expect(openMailboxTokenBundle(KEY, String(args.sealedSecret))).toMatchObject({
      refreshToken: "rt-1",
      accessToken: "at-1",
    });
  });

  it("refuses a state that was tampered with, belongs to another user or has expired", async () => {
    const { state, sealedState } = await started();
    const input = { provider: "microsoft" as const, code: "c", backfillDays: 90 };

    const forged = await harness().interactor.invoke({ ...input, state: "other", sealedState });
    const foreign = await harness().interactor.invoke({
      ...input,
      state,
      sealedState: sealSecret(
        KEY,
        JSON.stringify({
          provider: "microsoft",
          state,
          codeVerifier: "v",
          userId: "someone-else",
          issuedAt: ISSUED.getTime(),
        }),
      ),
    });
    const late = await harness({ now: new Date(ISSUED.getTime() + 11 * 60_000) }).interactor.invoke({
      ...input,
      state,
      sealedState,
    });
    const garbage = await harness().interactor.invoke({ ...input, state, sealedState: "not-sealed" });

    for (const result of [forged, foreign, late, garbage])
      expect(codesOf(result)).toEqual([CustomErrorCode.mailboxOAuthFailed]);
  });

  it("reports a failed exchange, an address already connected and an IMAP refusal", async () => {
    const { state, sealedState } = await started();
    const input = { provider: "microsoft" as const, code: "c", state, sealedState, backfillDays: 90 };

    const exchange = await harness({ fetcher: tokenEndpoint({ error: "invalid_grant" }, 400) }).interactor.invoke(
      input,
    );
    const duplicate = await harness({ existing: { id: "x" } }).interactor.invoke(input);
    const refused = harness({ verify: () => Promise.reject(new MailboxTransportError("authenticationFailed")) });
    const imap = await refused.interactor.invoke(input);

    expect(codesOf(exchange)).toEqual([CustomErrorCode.mailboxOAuthFailed]);
    expect(codesOf(duplicate)).toEqual([CustomErrorCode.mailboxAlreadyConnected]);
    expect(codesOf(imap)).toEqual([CustomErrorCode.mailboxAuthenticationFailed]);
    expect(refused.createMailboxOrThrow).not.toHaveBeenCalled();
  });
});
