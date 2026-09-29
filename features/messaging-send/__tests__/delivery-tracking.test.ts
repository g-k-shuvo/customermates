import { describe, expect, it } from "vitest";

import { MessageDeliveryEventKind } from "@/generated/prisma";

import { parseResendEvent } from "../tracking/resend-event";
import { signSvixPayload, verifySvixSignature } from "../tracking/svix-signature";

const SECRET = `whsec_${Buffer.from("a-test-signing-secret-of-some-length").toString("base64")}`;
const NOW = new Date("2026-09-28T12:00:00Z");
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));
const BODY = JSON.stringify({
  type: "email.bounced",
  created_at: "2026-09-28T11:59:58.000Z",
  data: { email_id: "re_123", bounce: { type: "Permanent", message: "Mailbox does not exist" } },
});

const signed = (overrides: Partial<{ id: string; timestamp: string; body: string; signature: string }> = {}) => {
  const id = overrides.id ?? "msg_1";
  const timestamp = overrides.timestamp ?? TIMESTAMP;
  const body = overrides.body ?? BODY;

  return {
    secret: SECRET,
    headers: { id, timestamp, signature: overrides.signature ?? `v1,${signSvixPayload(SECRET, id, timestamp, body)}` },
    body,
    now: NOW,
  };
};

describe("Svix signature verification", () => {
  it("accepts a correctly signed payload, also among several signatures", () => {
    expect(verifySvixSignature(signed())).toBe(true);

    const valid = signSvixPayload(SECRET, "msg_1", TIMESTAMP, BODY);
    expect(verifySvixSignature(signed({ signature: `v1,bm90LWl0 v1,${valid}` }))).toBe(true);
  });

  it("refuses a tampered body, a wrong secret, a stale timestamp and missing headers", () => {
    const valid = signed();

    expect(verifySvixSignature({ ...valid, body: BODY.replace("re_123", "re_999") })).toBe(false);
    expect(verifySvixSignature({ ...valid, secret: "whsec_b3RoZXI=" })).toBe(false);
    expect(verifySvixSignature(signed({ timestamp: String(Number(TIMESTAMP) - 600) }))).toBe(false);
    expect(verifySvixSignature(signed({ signature: `v2,${signSvixPayload(SECRET, "msg_1", TIMESTAMP, BODY)}` }))).toBe(
      false,
    );
    expect(verifySvixSignature({ ...valid, headers: { ...valid.headers, id: null } })).toBe(false);
  });
});

describe("Resend event parsing", () => {
  it("reads a permanent bounce as suppressing, with its detail", () => {
    expect(parseResendEvent(BODY, "msg_1")).toEqual({
      kind: MessageDeliveryEventKind.bounced,
      providerMessageId: "re_123",
      occurredAt: new Date("2026-09-28T11:59:58.000Z"),
      providerEventId: "msg_1",
      detail: "Permanent: Mailbox does not exist",
      suppresses: true,
    });
  });

  it("does not suppress a transient bounce or a delivery, and ignores unknown or malformed events", () => {
    const event = (type: string, bounce?: object) =>
      JSON.stringify({ type, created_at: "2026-09-28T11:00:00Z", data: { email_id: "re_1", bounce } });

    expect(parseResendEvent(event("email.bounced", { type: "Transient" }), null)?.suppresses).toBe(false);
    expect(parseResendEvent(event("email.delivered"), null)).toMatchObject({ kind: "delivered", suppresses: false });
    expect(parseResendEvent(event("email.complained"), null)).toMatchObject({ kind: "complained", suppresses: true });
    expect(parseResendEvent(event("email.opened"), null)).toBeNull();
    expect(parseResendEvent("not json", null)).toBeNull();
  });
});
