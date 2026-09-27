import type { SigningConfig } from "./signing-config";
import type {
  SigningEnvelopeState,
  SigningProvider,
  SigningRecipient,
  SigningRecipientState,
} from "./signing-provider";

import { createHmac, createSign, timingSafeEqual } from "node:crypto";

import { SigningEnvelopeStatus, SigningError, SigningFailure } from "./signing-provider";

export const DOCUSIGN_REQUEST_TIMEOUT_MS = 30_000;
export const DOCUSIGN_ASSERTION_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const CALLBACK_EVENTS = [
  "envelope-sent",
  "envelope-delivered",
  "envelope-completed",
  "envelope-declined",
  "envelope-voided",
  "recipient-delivered",
  "recipient-completed",
  "recipient-declined",
];
const ENVELOPE_STATUSES: ReadonlySet<string> = new Set(Object.values(SigningEnvelopeStatus));

export type DocuSignSigningProviderOptions = {
  fetch?: typeof fetch;
  now?: () => Date;
  requestTimeoutMs?: number;
};

type Account = { id: string; baseUri: string };

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function docuSignAssertion(config: SigningConfig, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: config.integrationKey,
      sub: config.userId,
      aud: new URL(config.authServer).host,
      iat: issuedAt,
      exp: issuedAt + DOCUSIGN_ASSERTION_LIFETIME_SECONDS,
      scope: "signature impersonation",
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  let signature: Buffer;
  try {
    signature = signer.sign(config.privateKey);
  } catch {
    throw new SigningError(SigningFailure.rejected, "the private key cannot sign");
  }

  return `${header}.${claims}.${base64Url(signature)}`;
}

export function failureForStatus(status: number, detail?: string): SigningError {
  if (status === 404) return new SigningError(SigningFailure.notFound, detail);
  if (status === 400 || status === 401 || status === 403) return new SigningError(SigningFailure.rejected, detail);

  return new SigningError(SigningFailure.unavailable, detail ?? `status ${status}`);
}

function envelopeStatusOf(value: unknown): SigningEnvelopeStatus | null {
  return typeof value === "string" && ENVELOPE_STATUSES.has(value) ? (value as SigningEnvelopeStatus) : null;
}

function recipientsOf(value: unknown): SigningRecipientState[] {
  const signers = (value as { signers?: unknown } | null | undefined)?.signers;
  if (!Array.isArray(signers)) return [];

  return signers.flatMap((signer: unknown) => {
    if (!signer || typeof signer !== "object") return [];
    const { email, name, status, signedDateTime } = signer as Record<string, unknown>;
    if (typeof email !== "string" || typeof name !== "string") return [];

    const signedAt = typeof signedDateTime === "string" ? new Date(signedDateTime) : null;

    return [
      {
        email,
        name,
        status: typeof status === "string" ? status : "unknown",
        completedAt: signedAt && !Number.isNaN(signedAt.getTime()) ? signedAt : null,
      },
    ];
  });
}

function originOf(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new SigningError(SigningFailure.rejected, "base_uri");

  return url.origin;
}

function matchesSignature(expected: Buffer, candidate: string): boolean {
  const given = Buffer.from(candidate.trim(), "utf8");
  const wanted = Buffer.from(expected.toString("base64"), "utf8");

  return given.length === wanted.length && timingSafeEqual(new Uint8Array(given), new Uint8Array(wanted));
}

export function createDocuSignSigningProvider(
  config: SigningConfig,
  options: DocuSignSigningProviderOptions = {},
): SigningProvider {
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.requestTimeoutMs ?? DOCUSIGN_REQUEST_TIMEOUT_MS;
  let token: { value: string; expiresAt: number } | null = null;
  let account: Account | null = null;

  const request = async (url: string, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await send(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw new SigningError(SigningFailure.unavailable, (error as Error | null)?.name);
    } finally {
      clearTimeout(timer);
    }
  };

  const accessToken = async (): Promise<string> => {
    if (token && token.expiresAt - TOKEN_REFRESH_MARGIN_MS > now().getTime()) return token.value;

    const response = await request(`${config.authServer}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: JWT_BEARER_GRANT,
        assertion: docuSignAssertion(config, now()),
      }).toString(),
    });
    const body = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
      error?: unknown;
    } | null;

    if (!response.ok || typeof body?.access_token !== "string") {
      if (body?.error === "consent_required") throw new SigningError(SigningFailure.consentRequired);
      throw failureForStatus(response.status, typeof body?.error === "string" ? body.error : undefined);
    }

    const lifetimeSeconds = typeof body.expires_in === "number" ? body.expires_in : DOCUSIGN_ASSERTION_LIFETIME_SECONDS;
    token = { value: body.access_token, expiresAt: now().getTime() + lifetimeSeconds * 1000 };

    return token.value;
  };

  const resolveAccount = async (): Promise<Account> => {
    if (account) return account;

    const response = await request(`${config.authServer}/oauth/userinfo`, {
      method: "GET",
      headers: { authorization: `Bearer ${await accessToken()}` },
    });
    const body = (await response.json().catch(() => null)) as {
      accounts?: { account_id?: unknown; is_default?: unknown; base_uri?: unknown }[];
    } | null;
    if (!response.ok || !Array.isArray(body?.accounts)) throw failureForStatus(response.status, "userinfo");

    const accounts = body.accounts;
    const chosen = config.accountId
      ? accounts.find((candidate) => candidate.account_id === config.accountId)
      : (accounts.find((candidate) => candidate.is_default === true) ?? accounts[0]);
    if (typeof chosen?.account_id !== "string" || typeof chosen.base_uri !== "string")
      throw new SigningError(SigningFailure.rejected, "the DocuSign user cannot use this account");

    account = { id: chosen.account_id, baseUri: originOf(chosen.base_uri) };

    return account;
  };

  const api = async (path: string, init: { method: string; body?: string; accept?: string }): Promise<Response> => {
    const { id, baseUri } = await resolveAccount();
    const response = await request(`${baseUri}/restapi/v2.1/accounts/${encodeURIComponent(id)}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        accept: init.accept ?? "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body,
    });
    if (response.status === 401) token = null;

    return response;
  };

  const errorCodeOf = async (response: Response): Promise<string | undefined> => {
    const body = (await response.json().catch(() => null)) as { errorCode?: unknown } | null;
    return typeof body?.errorCode === "string" ? body.errorCode : undefined;
  };

  return {
    configured: true,

    sendEnvelope: async ({ subject, message, fileName, pdf, recipients, callbackUrl }) => {
      const response = await api("/envelopes", {
        method: "POST",
        body: JSON.stringify({
          emailSubject: subject,
          ...(message ? { emailBlurb: message } : {}),
          documents: [
            {
              documentBase64: Buffer.from(pdf).toString("base64"),
              name: fileName,
              fileExtension: "pdf",
              documentId: "1",
            },
          ],
          recipients: {
            signers: recipients.map((recipient: SigningRecipient, index) => ({
              email: recipient.email,
              name: recipient.name,
              recipientId: String(index + 1),
              routingOrder: "1",
            })),
          },
          eventNotification: {
            url: callbackUrl,
            includeHMAC: "true",
            requireAcknowledgment: "true",
            loggingEnabled: "true",
            deliveryMode: "SIM",
            events: CALLBACK_EVENTS,
            eventData: { version: "restv2.1", format: "json", includeData: ["recipients"] },
          },
          status: "sent",
        }),
      });
      if (!response.ok) throw failureForStatus(response.status, await errorCodeOf(response));

      const body = (await response.json().catch(() => null)) as { envelopeId?: unknown } | null;
      if (typeof body?.envelopeId !== "string") throw new SigningError(SigningFailure.unavailable, "no envelope id");

      return { envelopeId: body.envelopeId };
    },

    voidEnvelope: async (envelopeId, reason) => {
      const response = await api(`/envelopes/${encodeURIComponent(envelopeId)}`, {
        method: "PUT",
        body: JSON.stringify({ status: "voided", voidedReason: reason }),
      });
      if (!response.ok) throw failureForStatus(response.status, await errorCodeOf(response));
      await response.body?.cancel();
    },

    fetchEnvelope: async (envelopeId) => {
      const response = await api(`/envelopes/${encodeURIComponent(envelopeId)}?include=recipients`, { method: "GET" });
      if (!response.ok) throw failureForStatus(response.status, await errorCodeOf(response));

      const body = (await response.json().catch(() => null)) as { status?: unknown; recipients?: unknown } | null;

      return { envelopeId, status: envelopeStatusOf(body?.status), recipients: recipientsOf(body?.recipients) };
    },

    downloadCompletedPdf: async (envelopeId) => {
      const response = await api(`/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`, {
        method: "GET",
        accept: "application/pdf",
      });
      if (!response.ok) throw failureForStatus(response.status, await errorCodeOf(response));

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-")
        throw new SigningError(SigningFailure.unavailable, "the completed document is not a PDF");

      return bytes;
    },

    verifyCallback: (rawBody, signatures) => {
      const expected = createHmac("sha256", config.connectHmacSecret).update(rawBody, "utf8").digest();

      return signatures.some((candidate) => matchesSignature(expected, candidate));
    },

    parseCallback: (rawBody): SigningEnvelopeState | null => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return null;
      }

      const data = (parsed as { data?: unknown } | null)?.data as
        | { envelopeId?: unknown; envelopeSummary?: { status?: unknown; recipients?: unknown } }
        | undefined;
      if (typeof data?.envelopeId !== "string") return null;

      return {
        envelopeId: data.envelopeId,
        status: envelopeStatusOf(data.envelopeSummary?.status),
        recipients: recipientsOf(data.envelopeSummary?.recipients),
      };
    },
  };
}
