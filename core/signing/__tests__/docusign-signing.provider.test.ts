import type { SigningConfig } from "../signing-config";

import { createHmac, createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createDocuSignSigningProvider, docuSignAssertion } from "../docusign-signing.provider";
import { nullSigningProvider } from "../null-signing.provider";
import { SigningFailure } from "../signing-provider";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const CONFIG: SigningConfig = {
  integrationKey: "integration-key",
  userId: "user-guid",
  privateKey: PRIVATE_KEY,
  authServer: "https://account-d.docusign.com",
  accountId: null,
  connectHmacSecret: "connect-secret",
};

const NOW = new Date("2026-09-27T10:00:00Z");
const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n% nda\n%%EOF\n", "latin1"));

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function provider(
  route: (call: Call) => Response | Promise<Response>,
  overrides: Partial<SigningConfig> = {},
  now: () => Date = () => NOW,
) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return await route(call);
  });

  return {
    signing: createDocuSignSigningProvider(
      { ...CONFIG, ...overrides },
      { fetch: fetch as unknown as typeof globalThis.fetch, now },
    ),
    calls,
  };
}

function docuSign(overrides: { token?: () => Response; envelope?: (call: Call) => Response } = {}) {
  return (call: Call): Response => {
    if (call.url === "https://account-d.docusign.com/oauth/token") {
      return (
        overrides.token?.() ?? jsonResponse(200, { access_token: "token-1", token_type: "Bearer", expires_in: 3600 })
      );
    }
    if (call.url === "https://account-d.docusign.com/oauth/userinfo") {
      return jsonResponse(200, {
        accounts: [
          { account_id: "other", is_default: false, base_uri: "https://eu.docusign.net" },
          { account_id: "acct-1", is_default: true, base_uri: "https://demo.docusign.net" },
        ],
      });
    }
    return overrides.envelope?.(call) ?? jsonResponse(201, { envelopeId: "env-1", status: "sent" });
  };
}

function decode(part: string) {
  return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

describe("DocuSign JWT grant", () => {
  it("signs an RS256 assertion for the configured user, on the auth server's host, for an hour", () => {
    const assertion = docuSignAssertion(CONFIG, NOW);
    const [header, claims, signature] = assertion.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);

    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toEqual({
      iss: "integration-key",
      sub: "user-guid",
      aud: "account-d.docusign.com",
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + 3600,
      scope: "signature impersonation",
    });
    expect(
      verifier.verify(
        createPublicKey(PRIVATE_KEY),
        new Uint8Array(Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64")),
      ),
    ).toBe(true);
  });

  it("reuses the access token until it is about to expire", async () => {
    let clock = NOW;
    const { signing, calls } = provider(docuSign(), {}, () => clock);

    await signing.fetchEnvelope("env-1");
    await signing.fetchEnvelope("env-1");
    clock = new Date(NOW.getTime() + 56 * 60 * 1000);
    await signing.fetchEnvelope("env-1");

    const tokenCalls = calls.filter((call) => call.url.endsWith("/oauth/token"));
    expect(tokenCalls).toHaveLength(2);
    expect(new URLSearchParams(tokenCalls[0].body).get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(calls.filter((call) => call.url.endsWith("/oauth/userinfo"))).toHaveLength(1);
  });

  it("reports missing consent separately from other refusals", async () => {
    const consent = provider(docuSign({ token: () => jsonResponse(400, { error: "consent_required" }) }));
    const refused = provider(docuSign({ token: () => jsonResponse(400, { error: "invalid_grant" }) }));

    await expect(consent.signing.fetchEnvelope("env-1")).rejects.toMatchObject({
      failure: SigningFailure.consentRequired,
    });
    await expect(refused.signing.fetchEnvelope("env-1")).rejects.toMatchObject({
      failure: SigningFailure.rejected,
      detail: "invalid_grant",
    });
  });

  it("uses the default account, or the configured one, on that account's base URI", async () => {
    const byDefault = provider(docuSign());
    const configured = provider(docuSign(), { accountId: "other" });

    await byDefault.signing.fetchEnvelope("env-1");
    await configured.signing.fetchEnvelope("env-1");

    expect(byDefault.calls.at(-1)?.url).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/acct-1/envelopes/env-1?include=recipients",
    );
    expect(configured.calls.at(-1)?.url).toBe(
      "https://eu.docusign.net/restapi/v2.1/accounts/other/envelopes/env-1?include=recipients",
    );
    expect(byDefault.calls.at(-1)?.headers.authorization).toBe("Bearer token-1");
  });
});

describe("DocuSign envelopes", () => {
  it("sends the PDF to every signer with a callback that carries an HMAC", async () => {
    const { signing, calls } = provider(docuSign());

    await expect(
      signing.sendEnvelope({
        subject: "Please sign: NDA",
        message: null,
        fileName: "NDA.pdf",
        pdf: PDF,
        recipients: [
          { name: "Pia Müller", email: "pia@example.test" },
          { name: "Max Bergmann", email: "max@example.test" },
        ],
        callbackUrl: "https://crm.example.test/api/webhooks/docusign",
      }),
    ).resolves.toEqual({ envelopeId: "env-1" });

    const sent = calls.at(-1) as Call;
    const body = JSON.parse(sent.body ?? "{}");
    expect(sent.url).toBe("https://demo.docusign.net/restapi/v2.1/accounts/acct-1/envelopes");
    expect(sent.method).toBe("POST");
    expect(body).toMatchObject({
      emailSubject: "Please sign: NDA",
      status: "sent",
      documents: [{ name: "NDA.pdf", fileExtension: "pdf", documentId: "1" }],
      recipients: {
        signers: [
          { name: "Pia Müller", email: "pia@example.test", recipientId: "1", routingOrder: "1" },
          { name: "Max Bergmann", email: "max@example.test", recipientId: "2", routingOrder: "1" },
        ],
      },
      eventNotification: {
        url: "https://crm.example.test/api/webhooks/docusign",
        includeHMAC: "true",
        requireAcknowledgment: "true",
        eventData: { version: "restv2.1", format: "json", includeData: ["recipients"] },
      },
    });
    expect(body.emailBlurb).toBeUndefined();
    expect(Buffer.from(body.documents[0].documentBase64, "base64").toString("latin1")).toBe(
      Buffer.from(PDF).toString("latin1"),
    );
    expect(body.eventNotification.events).toEqual(expect.arrayContaining(["envelope-completed", "envelope-declined"]));
  });

  it("maps DocuSign's refusals and outages", async () => {
    const rejected = provider(
      docuSign({ envelope: () => jsonResponse(400, { errorCode: "INVALID_EMAIL_ADDRESS_FOR_RECIPIENT" }) }),
    );
    const down = provider(docuSign({ envelope: () => jsonResponse(503, {}) }));
    const send = (signing: ReturnType<typeof provider>["signing"]) =>
      signing.sendEnvelope({
        subject: "s",
        message: "m",
        fileName: "a.pdf",
        pdf: PDF,
        recipients: [{ name: "A", email: "a@example.test" }],
        callbackUrl: "https://crm.example.test/api/webhooks/docusign",
      });

    await expect(send(rejected.signing)).rejects.toMatchObject({
      failure: SigningFailure.rejected,
      detail: "INVALID_EMAIL_ADDRESS_FOR_RECIPIENT",
    });
    await expect(send(down.signing)).rejects.toMatchObject({ failure: SigningFailure.unavailable });
  });

  it("voids, reads the status with recipients, and downloads the completed PDF", async () => {
    const { signing, calls } = provider(
      docuSign({
        envelope: (call) => {
          if (call.method === "PUT") return jsonResponse(200, { envelopeId: "env-1" });
          if (call.url.endsWith("/documents/combined")) {
            return new Response(Buffer.from("%PDF-1.4 signed", "latin1"), {
              headers: { "content-type": "application/pdf" },
            });
          }
          return jsonResponse(200, {
            status: "completed",
            recipients: {
              signers: [
                { name: "Pia", email: "pia@example.test", status: "completed", signedDateTime: "2026-09-27T09:00:00Z" },
                { name: "Broken" },
              ],
            },
          });
        },
      }),
    );

    await signing.voidEnvelope("env-1", "Sent to the wrong person");
    const state = await signing.fetchEnvelope("env-1");
    const pdf = await signing.downloadCompletedPdf("env-1");

    expect(JSON.parse(calls.find((call) => call.method === "PUT")?.body ?? "{}")).toEqual({
      status: "voided",
      voidedReason: "Sent to the wrong person",
    });
    expect(state).toEqual({
      envelopeId: "env-1",
      status: "completed",
      recipients: [
        { name: "Pia", email: "pia@example.test", status: "completed", completedAt: new Date("2026-09-27T09:00:00Z") },
      ],
    });
    expect(Buffer.from(pdf).toString("latin1")).toBe("%PDF-1.4 signed");
  });

  it("refuses a completed document that is not a PDF", async () => {
    const { signing } = provider(docuSign({ envelope: () => new Response("<html>error</html>") }));

    await expect(signing.downloadCompletedPdf("env-1")).rejects.toMatchObject({ failure: SigningFailure.unavailable });
  });

  it("gives up on DocuSign when it does not answer", async () => {
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const signing = createDocuSignSigningProvider(CONFIG, {
      fetch: hanging as unknown as typeof globalThis.fetch,
      now: () => NOW,
      requestTimeoutMs: 20,
    });

    await expect(signing.fetchEnvelope("env-1")).rejects.toMatchObject({
      failure: SigningFailure.unavailable,
      detail: "AbortError",
    });
  });
});

describe("DocuSign Connect callbacks", () => {
  const body = JSON.stringify({
    event: "envelope-completed",
    data: {
      envelopeId: "env-1",
      envelopeSummary: {
        status: "completed",
        recipients: { signers: [{ name: "Pia", email: "pia@example.test", status: "completed" }] },
      },
    },
  });
  const signature = createHmac("sha256", "connect-secret").update(body).digest("base64");

  it("accepts a callback signed with the Connect key, under any of the signature headers", () => {
    const { signing } = provider(docuSign());

    expect(signing.verifyCallback(body, [signature])).toBe(true);
    expect(signing.verifyCallback(body, ["stale-key-signature", signature])).toBe(true);
    expect(signing.verifyCallback(`${body} `, [signature])).toBe(false);
    expect(signing.verifyCallback(body, [])).toBe(false);
  });

  it("reads the envelope's status and recipients, and ignores what it cannot read", () => {
    const { signing } = provider(docuSign());

    expect(signing.parseCallback(body)).toEqual({
      envelopeId: "env-1",
      status: "completed",
      recipients: [{ name: "Pia", email: "pia@example.test", status: "completed", completedAt: null }],
    });
    expect(signing.parseCallback("not json")).toBeNull();
    expect(signing.parseCallback(JSON.stringify({ data: {} }))).toBeNull();
    expect(
      signing.parseCallback(JSON.stringify({ data: { envelopeId: "env-2", envelopeSummary: { status: "correct" } } })),
    ).toEqual({ envelopeId: "env-2", status: null, recipients: [] });
  });
});

describe("null signing provider", () => {
  it("reports itself unconfigured and refuses everything", async () => {
    expect(nullSigningProvider.configured).toBe(false);
    expect(nullSigningProvider.verifyCallback("{}", ["x"])).toBe(false);
    await expect(nullSigningProvider.fetchEnvelope("env-1")).rejects.toMatchObject({
      failure: SigningFailure.notConfigured,
    });
  });
});
