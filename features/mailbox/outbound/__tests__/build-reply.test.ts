import { describe, expect, it } from "vitest";

import { buildReply, replyReferences, replySubject, type ReplySourceMessage } from "../build-reply";

const MAILBOX = "max@vendor.example";

function source(overrides: Partial<ReplySourceMessage> = {}): ReplySourceMessage {
  return {
    messageId: "<root@buyer.example>",
    references: null,
    subject: "Renewal quote",
    senderIdentifier: "anna@buyer.example",
    toIdentifiers: [MAILBOX],
    ccIdentifiers: [],
    ...overrides,
  };
}

function reply(overrides: Partial<ReplySourceMessage> = {}, replyAll = false) {
  return buildReply({
    mailboxAddress: MAILBOX,
    mailboxDisplayName: "Max Bergmann",
    source: source(overrides),
    body: "Thanks, sending it over.",
    replyAll,
  });
}

describe("replySubject", () => {
  it("prefixes a fresh subject", () => {
    expect(replySubject("Renewal quote")).toBe("Re: Renewal quote");
  });

  it("does not stack prefixes on an existing reply", () => {
    expect(replySubject("Re: Renewal quote")).toBe("Re: Renewal quote");
  });

  it("normalises a foreign reply prefix rather than stacking on it", () => {
    expect(replySubject("AW: Angebot")).toBe("Re: Angebot");
    expect(replySubject("Rif: Preventivo")).toBe("Re: Preventivo");
  });

  it("normalises a numbered prefix", () => {
    expect(replySubject("Re[2]: Renewal quote")).toBe("Re: Renewal quote");
  });

  it("handles an absent subject", () => {
    expect(replySubject(null)).toBe("Re:");
    expect(replySubject("   ")).toBe("Re:");
  });
});

describe("replyReferences", () => {
  it("starts the chain with the message being answered", () => {
    expect(replyReferences(source())).toEqual(["<root@buyer.example>"]);
  });

  it("appends the answered message to an existing chain", () => {
    const chain = replyReferences(source({ references: "<a@x.example> <b@x.example>", messageId: "<c@x.example>" }));

    expect(chain).toEqual(["<a@x.example>", "<b@x.example>", "<c@x.example>"]);
  });

  it("skips malformed entries in the existing chain", () => {
    const chain = replyReferences(source({ references: "not-an-id <a@x.example> <>", messageId: "<b@x.example>" }));

    expect(chain).toEqual(["<a@x.example>", "<b@x.example>"]);
  });

  it("never repeats an id already in the chain", () => {
    const chain = replyReferences(source({ references: "<a@x.example>", messageId: "<a@x.example>" }));

    expect(chain).toEqual(["<a@x.example>"]);
  });

  it("keeps the root and the most recent ids when the chain grows long", () => {
    const long = Array.from({ length: 40 }, (_, index) => `<m${index}@x.example>`);
    const chain = replyReferences(source({ references: long.join(" "), messageId: "<latest@x.example>" }));

    expect(chain).toHaveLength(20);
    expect(chain[0]).toBe("<m0@x.example>");
    expect(chain[chain.length - 1]).toBe("<latest@x.example>");
  });

  it("copes with no references and no message id", () => {
    expect(replyReferences(source({ references: null, messageId: null }))).toEqual([]);
  });
});

describe("buildReply", () => {
  it("answers the sender and threads the reply", () => {
    const built = reply();

    expect(built.to).toEqual(["anna@buyer.example"]);
    expect(built.cc).toEqual([]);
    expect(built.inReplyTo).toBe("<root@buyer.example>");
    expect(built.references).toEqual(["<root@buyer.example>"]);
    expect(built.subject).toBe("Re: Renewal quote");
  });

  it("uses the display name in the from header", () => {
    expect(reply().from).toBe("Max Bergmann <max@vendor.example>");
  });

  it("falls back to the bare address without a display name", () => {
    const built = buildReply({
      mailboxAddress: MAILBOX,
      mailboxDisplayName: null,
      source: source(),
      body: "ok",
      replyAll: false,
    });

    expect(built.from).toBe(MAILBOX);
  });

  it("never addresses the reply to the mailbox itself", () => {
    const built = reply({ senderIdentifier: MAILBOX, toIdentifiers: [MAILBOX, "anna@buyer.example"] }, true);

    expect(built.to).not.toContain(MAILBOX);
    expect(built.cc).not.toContain(MAILBOX);
  });

  it("keeps everyone on a reply-all without duplicating the sender", () => {
    const built = reply(
      {
        senderIdentifier: "anna@buyer.example",
        toIdentifiers: [MAILBOX, "ben@buyer.example", "anna@buyer.example"],
        ccIdentifiers: ["legal@buyer.example"],
      },
      true,
    );

    expect(built.to).toEqual(["anna@buyer.example", "ben@buyer.example"]);
    expect(built.cc).toEqual(["legal@buyer.example"]);
  });

  it("leaves cc empty on a plain reply even when the original had one", () => {
    const built = reply({ ccIdentifiers: ["legal@buyer.example"] }, false);

    expect(built.cc).toEqual([]);
  });

  it("never puts an address in both to and cc", () => {
    const built = reply(
      { senderIdentifier: "anna@buyer.example", ccIdentifiers: ["anna@buyer.example", "legal@buyer.example"] },
      true,
    );

    expect(built.cc).not.toContain("anna@buyer.example");
    expect(built.cc).toEqual(["legal@buyer.example"]);
  });

  it("lowercases and trims addresses so duplicates collapse", () => {
    const built = reply({ senderIdentifier: "  Anna@Buyer.Example ", toIdentifiers: ["anna@buyer.example"] }, true);

    expect(built.to).toEqual(["anna@buyer.example"]);
  });

  it("answers the original recipients when the sender is unknown", () => {
    const built = reply({ senderIdentifier: null, toIdentifiers: [MAILBOX, "ben@buyer.example"] });

    expect(built.to).toEqual(["ben@buyer.example"]);
  });

  it("ignores entries that are not addresses", () => {
    const built = reply({ senderIdentifier: "not-an-address", toIdentifiers: ["ben@buyer.example"] });

    expect(built.to).toEqual(["ben@buyer.example"]);
  });

  it("carries the body through unchanged", () => {
    expect(reply().text).toBe("Thanks, sending it over.");
  });
});
