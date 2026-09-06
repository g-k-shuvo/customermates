import { describe, expect, it } from "vitest";

import type { ThreadingHeaders } from "../thread-key";

import {
  conversationRootMessageId,
  normalizeMessageId,
  normalizeParticipantAddresses,
  normalizeSubject,
  parseMessageIdList,
  subjectThreadKey,
  threadKey,
} from "../thread-key";

const ROOT_MESSAGE_ID = "<CAF9x-1@mail.acme.test>";
const ROOT_THREAD_KEY = "imap:thread:CAF9x-1@mail.acme.test";
const PARTICIPANTS = ["kim@acme.test", "sam@vendor.test"];

const original: ThreadingHeaders = {
  messageId: ROOT_MESSAGE_ID,
  subject: "Invoice 42",
  participants: PARTICIPANTS,
};

const reply: ThreadingHeaders = {
  messageId: "<b2-reply@mail.vendor.test>",
  inReplyTo: ROOT_MESSAGE_ID,
  references: ROOT_MESSAGE_ID,
  subject: "Re: Invoice 42",
  participants: PARTICIPANTS,
};

const replyToTheReply: ThreadingHeaders = {
  messageId: "<c3-reply@mail.acme.test>",
  inReplyTo: "<b2-reply@mail.vendor.test>",
  references: "<CAF9x-1@mail.acme.test> <b2-reply@mail.vendor.test>",
  subject: "Re: Re: Invoice 42",
  participants: PARTICIPANTS,
};

describe("normalizeMessageId", () => {
  it("strips the angle brackets and the surrounding whitespace", () => {
    expect(normalizeMessageId("  <CAF9x-1@mail.acme.test>  ")).toBe("CAF9x-1@mail.acme.test");
    expect(normalizeMessageId("< CAF9x-1@mail.acme.test >")).toBe("CAF9x-1@mail.acme.test");
    expect(normalizeMessageId("CAF9x-1@mail.acme.test")).toBe("CAF9x-1@mail.acme.test");
  });

  it("keeps the local part case and lowercases only the domain", () => {
    expect(normalizeMessageId("<CAF9x-1@Mail.ACME.Test>")).toBe("CAF9x-1@mail.acme.test");
    expect(normalizeMessageId("<caf9x-1@mail.acme.test>")).not.toBe(normalizeMessageId("<CAF9x-1@mail.acme.test>"));
  });

  it("rejects an empty or bracket-only value", () => {
    expect(normalizeMessageId("")).toBeNull();
    expect(normalizeMessageId("   ")).toBeNull();
    expect(normalizeMessageId("<>")).toBeNull();
    expect(normalizeMessageId("<   >")).toBeNull();
    expect(normalizeMessageId(null)).toBeNull();
    expect(normalizeMessageId(undefined)).toBeNull();
  });

  it("rejects a value that is not shaped like an addr-spec", () => {
    expect(normalizeMessageId("<no-at-sign>")).toBeNull();
    expect(normalizeMessageId("<@only-a-domain.test>")).toBeNull();
    expect(normalizeMessageId("<local-part-only@>")).toBeNull();
    expect(normalizeMessageId("<two ids@mail.acme.test>")).toBeNull();
  });

  it("rejects control characters that a text column cannot store", () => {
    expect(normalizeMessageId("<a@x.test\u0000truncated>")).toBeNull();
    expect(normalizeMessageId("<a\u0007b@x.test>")).toBeNull();
    expect(normalizeMessageId("<a@x.test\u001b[31m>")).toBeNull();
    expect(normalizeMessageId("<a@x.test\u007f>")).toBeNull();
  });

  it("rejects the specials that only ever appear around an addr-spec", () => {
    expect(normalizeMessageId("(a@x.test)")).toBeNull();
    expect(normalizeMessageId('"a@x.test"')).toBeNull();
    expect(normalizeMessageId("a@x.test;")).toBeNull();
  });

  it("rejects an id longer than a header line may be", () => {
    expect(normalizeMessageId(`<${"a".repeat(1000)}@x.test>`)).toBeNull();
    expect(normalizeMessageId(`<${"a".repeat(100000)}@x.test>`)).toBeNull();
    expect(normalizeMessageId(`<${"a".repeat(900)}@x.test>`)).toBe(`${"a".repeat(900)}@x.test`);
  });
});

describe("parseMessageIdList", () => {
  it("reads whitespace and comma separated entries in header order", () => {
    expect(parseMessageIdList("<a@x.test> <b@x.test>")).toEqual(["a@x.test", "b@x.test"]);
    expect(parseMessageIdList("<a@x.test>,<b@x.test>")).toEqual(["a@x.test", "b@x.test"]);
    expect(parseMessageIdList("<a@x.test>,\r\n\t<b@x.test>")).toEqual(["a@x.test", "b@x.test"]);
  });

  it("skips malformed entries without throwing", () => {
    expect(parseMessageIdList("<> , not-a-message-id <@nodomain> <a@x.test>")).toEqual(["a@x.test"]);
    expect(parseMessageIdList("(a comment) <b@x.test> <>")).toEqual(["b@x.test"]);
    expect(parseMessageIdList("garbage")).toEqual([]);
    expect(parseMessageIdList("")).toEqual([]);
    expect(parseMessageIdList(null)).toEqual([]);
  });

  it("reads a header that arrives already split into entries", () => {
    expect(parseMessageIdList(["<a@x.test>", null, "  ", "<b@x.test>"])).toEqual(["a@x.test", "b@x.test"]);
  });

  it("skips a comment that carries an address instead of reading it as an entry", () => {
    expect(parseMessageIdList("(see b@y.test) <a@x.test>")).toEqual(["a@x.test"]);
    expect(parseMessageIdList('(from "Bob" bob@corp.test) <root@x.test>')).toEqual(["root@x.test"]);
    expect(parseMessageIdList("<a@x.test> (was: b@y.test)")).toEqual(["a@x.test"]);
  });

  it("ignores a bare address once the header carries a real angle-bracketed id", () => {
    expect(parseMessageIdList("mailing-list@lists.test <root@x.test>")).toEqual(["root@x.test"]);
    expect(parseMessageIdList("<root@x.test>, undisclosed@recipients.test")).toEqual(["root@x.test"]);
  });

  it("still recovers a bare id when no angle-bracketed entry survives normalisation", () => {
    expect(parseMessageIdList("a@x.test")).toEqual(["a@x.test"]);
    expect(parseMessageIdList(" a@x.test , b@y.test ")).toEqual(["a@x.test", "b@y.test"]);
    expect(parseMessageIdList("<> a@x.test")).toEqual(["a@x.test"]);
    expect(parseMessageIdList("<@nodomain> a@x.test")).toEqual(["a@x.test"]);
  });

  it("does not throw when the header is neither a string nor an array", () => {
    expect(parseMessageIdList({ length: 1 } as never)).toEqual([]);
    expect(parseMessageIdList(42 as never)).toEqual([]);
  });
});

describe("normalizeSubject", () => {
  it("strips stacked German reply and forward prefixes", () => {
    expect(normalizeSubject("AW: WG: AW:  Rechnung Nr. 42")).toBe("rechnung nr. 42");
    expect(normalizeSubject("Antw: Aw: Angebot")).toBe("angebot");
  });

  it("strips stacked Italian reply and forward prefixes", () => {
    expect(normalizeSubject("R: Rif: R:\tPreventivo 2026")).toBe("preventivo 2026");
    expect(normalizeSubject("Rif: I: Preventivo 2026")).toBe("i: preventivo 2026");
  });

  it("strips stacked prefixes across locales and clients", () => {
    expect(normalizeSubject("Re: Fwd: Re: Invoice 42")).toBe("invoice 42");
    expect(normalizeSubject("Re[2]: Invoice 42")).toBe("invoice 42");
    expect(normalizeSubject("RE(3):Fw:Invoice 42")).toBe("invoice 42");
    expect(normalizeSubject("SV: VS: TR: RV: Invoice 42")).toBe("invoice 42");
    expect(normalizeSubject("Re : Invoice 42")).toBe("invoice 42");
  });

  it("collapses whitespace and lowercases what is left", () => {
    expect(normalizeSubject("  Invoice   42\r\n")).toBe("invoice 42");
    expect(normalizeSubject(null)).toBe("");
    expect(normalizeSubject("Re: ")).toBe("");
  });

  it("leaves a subject that merely starts like a prefix alone", () => {
    expect(normalizeSubject("Report: Q3")).toBe("report: q3");
    expect(normalizeSubject("Reference architecture")).toBe("reference architecture");
    expect(normalizeSubject("Rechnung: 42")).toBe("rechnung: 42");
  });
});

describe("normalizeParticipantAddresses", () => {
  it("lowercases, de-duplicates and sorts the address set", () => {
    expect(normalizeParticipantAddresses(["SAM@Vendor.Test", "kim@acme.test", "sam@vendor.test"])).toEqual([
      "kim@acme.test",
      "sam@vendor.test",
    ]);
  });

  it("reads the address out of a display-name mailbox and drops what is not an address", () => {
    expect(normalizeParticipantAddresses(["Sam Vendor <SAM@Vendor.Test>", "Kim", null, undefined, " "])).toEqual([
      "sam@vendor.test",
    ]);
  });

  it("reads the address out of a mailbox that carries a trailing comment", () => {
    expect(normalizeParticipantAddresses(["Sam <SAM@Vendor.Test> (Vendor Ltd)"])).toEqual(["sam@vendor.test"]);
  });
});

describe("conversationRootMessageId", () => {
  it("prefers the first reference, then in-reply-to, then the message's own id", () => {
    expect(conversationRootMessageId(replyToTheReply)).toBe("CAF9x-1@mail.acme.test");
    expect(conversationRootMessageId({ messageId: "<z@x.test>", inReplyTo: ROOT_MESSAGE_ID })).toBe(
      "CAF9x-1@mail.acme.test",
    );
    expect(conversationRootMessageId(original)).toBe("CAF9x-1@mail.acme.test");
    expect(conversationRootMessageId({ subject: "Invoice 42" })).toBeNull();
  });
});

describe("threadKey", () => {
  it("keeps a plain reply chain on one conversation", () => {
    expect(threadKey(original)).toEqual({ value: ROOT_THREAD_KEY, source: "message-id" });
    expect(threadKey(reply)).toEqual({ value: ROOT_THREAD_KEY, source: "references" });
    expect(threadKey(replyToTheReply)).toEqual({ value: ROOT_THREAD_KEY, source: "references" });
  });

  it("keeps a forward that carries the original references on the same conversation", () => {
    const forward: ThreadingHeaders = {
      messageId: "<d4-forward@mail.acme.test>",
      references: "<CAF9x-1@mail.acme.test>, <b2-reply@mail.vendor.test>",
      subject: "Fwd: Invoice 42",
      participants: ["kim@acme.test", "lee@partner.test"],
    };

    expect(threadKey(forward)).toEqual({ value: ROOT_THREAD_KEY, source: "references" });
  });

  it("threads a reply that carries only in-reply-to", () => {
    const replyWithoutReferences: ThreadingHeaders = {
      messageId: "<e5-reply@mail.vendor.test>",
      inReplyTo: " <CAF9x-1@Mail.Acme.Test> ",
      subject: "AW: Invoice 42",
      participants: PARTICIPANTS,
    };

    expect(threadKey(replyWithoutReferences)).toEqual({ value: ROOT_THREAD_KEY, source: "in-reply-to" });
  });

  it("picks the first usable reference when the header carries malformed entries", () => {
    const mangled: ThreadingHeaders = {
      messageId: "<f6-reply@mail.vendor.test>",
      references: "<>, not-a-message-id <@nodomain> <CAF9x-1@mail.acme.test> <b2-reply@mail.vendor.test>",
      subject: "Re: Invoice 42",
      participants: PARTICIPANTS,
    };

    expect(threadKey(mangled)).toEqual({ value: ROOT_THREAD_KEY, source: "references" });
  });

  it("threads on the real reference when the header opens with a comment", () => {
    const commented: ThreadingHeaders = {
      messageId: "<g7-reply@mail.vendor.test>",
      references: "(bob@evil.test) <CAF9x-1@mail.acme.test>",
      subject: "Re: Invoice 42",
      participants: PARTICIPANTS,
    };
    const listPrefixed: ThreadingHeaders = {
      ...commented,
      references: "acme-list@lists.test <CAF9x-1@mail.acme.test>",
    };

    expect(threadKey(commented)).toEqual({ value: ROOT_THREAD_KEY, source: "references" });
    expect(threadKey(listPrefixed)).toEqual({ value: ROOT_THREAD_KEY, source: "references" });
  });

  it("never lets a control character reach the key", () => {
    const nul = String.fromCharCode(0);
    const poisoned: ThreadingHeaders = {
      messageId: `<a@x.test${nul}drop>`,
      inReplyTo: `<CAF9x-1@mail.acme.test${nul}>`,
      subject: "Invoice 42",
      participants: PARTICIPANTS,
    };
    const key = threadKey(poisoned);

    expect(key?.source).toBe("subject");
    expect(key?.value).not.toContain(nul);
  });

  it("falls back rather than emitting a key too long for its unique index", () => {
    const oversized: ThreadingHeaders = {
      messageId: `<${"a".repeat(4000)}@x.test>`,
      references: `<${"b".repeat(4000)}@x.test>`,
      subject: "Invoice 42",
      participants: PARTICIPANTS,
    };
    const key = threadKey(oversized);

    expect(key?.source).toBe("subject");
    expect(key?.value.length).toBeLessThan(80);
  });

  it("falls back to the subject and participants when every message id is missing or junk", () => {
    const headerless: ThreadingHeaders = { subject: "Invoice 42", participants: PARTICIPANTS };
    const key = threadKey(headerless);

    expect(key?.source).toBe("subject");
    expect(key?.value).toBe(subjectThreadKey("Invoice 42", PARTICIPANTS));
    expect(key?.value.startsWith("imap:subject:")).toBe(true);
    expect(threadKey({ messageId: "<>", inReplyTo: "junk", references: "<@nodomain>", ...headerless })).toEqual(key);
  });

  it("matches a header-stripped forward to the original by subject and participants", () => {
    const headerless: ThreadingHeaders = { subject: "Invoice 42", participants: PARTICIPANTS };
    const strippedForward: ThreadingHeaders = {
      subject: "Fwd: Re: Invoice 42",
      participants: ["Sam Vendor <SAM@Vendor.Test>", "kim@acme.test", "kim@acme.test"],
    };

    expect(threadKey(strippedForward)).toEqual(threadKey(headerless));
  });

  it("keeps two unrelated messages apart", () => {
    const unrelatedById: ThreadingHeaders = {
      messageId: "<zz9-unrelated@mail.other.test>",
      subject: "Invoice 42",
      participants: PARTICIPANTS,
    };
    const otherSubject: ThreadingHeaders = { subject: "Invoice 43", participants: PARTICIPANTS };
    const otherParticipants: ThreadingHeaders = { subject: "Invoice 42", participants: ["lee@partner.test"] };
    const headerless: ThreadingHeaders = { subject: "Invoice 42", participants: PARTICIPANTS };

    expect(threadKey(unrelatedById)?.value).not.toBe(ROOT_THREAD_KEY);
    expect(threadKey(otherSubject)?.value).not.toBe(threadKey(headerless)?.value);
    expect(threadKey(otherParticipants)?.value).not.toBe(threadKey(headerless)?.value);
  });

  it("keeps a subject and a participant list from swapping their way into one key", () => {
    const subjectCarriesTheAddress: ThreadingHeaders = { subject: "Invoice 42 kim@acme.test", participants: [] };
    const participantCarriesTheAddress: ThreadingHeaders = {
      subject: "Invoice 42",
      participants: ["kim@acme.test"],
    };

    expect(threadKey(subjectCarriesTheAddress)?.value).not.toBe(threadKey(participantCarriesTheAddress)?.value);
  });

  it("reports nothing to thread on when there is no message id and no subject", () => {
    expect(threadKey({})).toBeNull();
    expect(threadKey({ subject: "   ", participants: PARTICIPANTS })).toBeNull();
    expect(threadKey({ subject: "Re: Fwd:", participants: PARTICIPANTS })).toBeNull();
  });

  it("returns the same key for the same headers and leaves its input untouched", () => {
    const participants = ["SAM@Vendor.Test", "kim@acme.test"];
    const headers: ThreadingHeaders = { subject: "Re: Invoice 42", participants };

    expect(threadKey(headers)).toEqual(threadKey(headers));
    expect(threadKey(replyToTheReply)).toEqual(threadKey(replyToTheReply));
    expect(participants).toEqual(["SAM@Vendor.Test", "kim@acme.test"]);
    expect(headers).toEqual({ subject: "Re: Invoice 42", participants });
  });
});
