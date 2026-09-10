import { describe, expect, it } from "vitest";

import { buildForward, forwardSubject, quoteForwardedMessage } from "../build-forward";

const SOURCE = {
  subject: "Quarterly numbers",
  senderIdentifier: "alice@vendor.example",
  senderDisplayName: "Alice Vendor",
  toIdentifiers: ["max@agency.example"],
  ccIdentifiers: ["books@agency.example"],
  sentAt: new Date("2026-09-01T09:15:00Z"),
  bodyText: "Numbers attached.",
};

function forward(overrides: Partial<Parameters<typeof buildForward>[0]> = {}) {
  return buildForward({
    mailboxAddress: "max@agency.example",
    mailboxDisplayName: "Max",
    recipients: ["carol@partner.example"],
    source: SOURCE,
    body: "Passing this on.",
    ...overrides,
  });
}

describe("forwardSubject", () => {
  it("prefixes a plain subject", () => {
    expect(forwardSubject("Quarterly numbers")).toBe("Fwd: Quarterly numbers");
  });

  it("collapses an existing forward prefix instead of stacking them", () => {
    expect(forwardSubject("Fwd: Quarterly numbers")).toBe("Fwd: Quarterly numbers");
    expect(forwardSubject("FW: Quarterly numbers")).toBe("Fwd: Quarterly numbers");
    expect(forwardSubject("WG: Quartalszahlen")).toBe("Fwd: Quartalszahlen");
  });

  it("keeps a reply prefix, which is part of the subject being forwarded", () => {
    expect(forwardSubject("Re: Quarterly numbers")).toBe("Fwd: Re: Quarterly numbers");
  });

  it("falls back to the bare prefix when there is no subject", () => {
    expect(forwardSubject(null)).toBe("Fwd:");
    expect(forwardSubject("   ")).toBe("Fwd:");
  });
});

describe("quoteForwardedMessage", () => {
  it("quotes the original with its own headers above the body", () => {
    expect(quoteForwardedMessage(SOURCE)).toBe(
      [
        "---------- Forwarded message ----------",
        "From: Alice Vendor <alice@vendor.example>",
        "Date: 2026-09-01T09:15:00.000Z",
        "Subject: Quarterly numbers",
        "To: max@agency.example",
        "Cc: books@agency.example",
        "",
        "Numbers attached.",
      ].join("\n"),
    );
  });

  it("leaves out the headers it has no value for", () => {
    const quoted = quoteForwardedMessage({
      subject: null,
      senderIdentifier: null,
      senderDisplayName: null,
      toIdentifiers: [],
      ccIdentifiers: [],
      sentAt: null,
      bodyText: null,
    });

    expect(quoted).toBe("---------- Forwarded message ----------");
  });
});

describe("buildForward", () => {
  it("never continues the original thread, so replies do not reach the first recipients", () => {
    const built = forward();

    expect(built.inReplyTo).toBeNull();
    expect(built.references).toEqual([]);
  });

  it("sends to the addresses given rather than to the conversation's participants", () => {
    const built = forward({ recipients: ["carol@partner.example", "dan@partner.example"] });

    expect(built.to).toEqual(["carol@partner.example", "dan@partner.example"]);
    expect(built.cc).toEqual([]);
  });

  it("normalises, deduplicates and drops recipients that are not addresses", () => {
    const built = forward({ recipients: ["Carol@Partner.example", "carol@partner.example", "not-an-address", ""] });

    expect(built.to).toEqual(["carol@partner.example"]);
  });

  it("puts the note above the quoted original", () => {
    const built = forward();

    expect(built.text.startsWith("Passing this on.\n\n---------- Forwarded message ----------")).toBe(true);
    expect(built.text).toContain("Numbers attached.");
  });

  it("sends only the quoted original when no note was written", () => {
    const built = forward({ body: "   " });

    expect(built.text.startsWith("---------- Forwarded message ----------")).toBe(true);
  });

  it("sends as the mailbox owner with the Fwd subject", () => {
    const built = forward();

    expect(built.from).toBe("Max <max@agency.example>");
    expect(built.subject).toBe("Fwd: Quarterly numbers");
  });
});
