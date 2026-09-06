import { describe, expect, it } from "vitest";

import type { MailboxSyncContext, ParsedMailboxMessage } from "../normalize-message";
import { normalizeAddress, normalizeMessage } from "../normalize-message";

const CONTEXT: MailboxSyncContext = {
  companyId: "company-1",
  connectedAccountId: "account-1",
  messagingThreadId: "thread-1",
  mailboxAddress: "Kim@Acme.Test",
  mailboxDisplayName: "Kim Acme",
};

const RECEIVED_AT = new Date("2026-03-03T09:00:05.000Z");

function addressList(...entries: { address?: string; name?: string }[]) {
  return { value: entries };
}

function inboundMessage(overrides: Partial<ParsedMailboxMessage> = {}): ParsedMailboxMessage {
  return {
    messageId: "<CAF9x@mail.example>",
    from: addressList({ address: "Zoe@Partner.Test", name: "Zoe Partner" }),
    to: addressList({ address: "kim@acme.test", name: "Kim Acme" }),
    subject: "Invoice 42",
    date: "Tue, 03 Mar 2026 09:00:00 +0000",
    text: "Please find the invoice attached.",
    receivedAt: RECEIVED_AT,
    folderIds: ["INBOX"],
    providerMessageId: "INBOX:1699887766:4821",
    ...overrides,
  };
}

describe("normalizeMessage row mapping", () => {
  it("maps an inbound mail onto every messaging column the sync layer must supply", () => {
    const { message, sentAtSource } = normalizeMessage(inboundMessage(), CONTEXT);

    expect(message).toEqual({
      companyId: "company-1",
      messagingThreadId: "thread-1",
      connectedAccountId: "account-1",
      unipileMessageId: "imap:msg:id:CAF9x@mail.example",
      providerMessageId: "INBOX:1699887766:4821",
      provider: "mail",
      direction: "inbound",
      origin: "external",
      sender: {
        attendeeId: "zoe@partner.test",
        identifier: "zoe@partner.test",
        displayName: "Zoe Partner",
        isSelf: false,
      },
      senderIdentifier: "zoe@partner.test",
      recipients: {
        to: [{ attendeeId: "kim@acme.test", identifier: "kim@acme.test", displayName: "Kim Acme" }],
        cc: [],
        bcc: [],
      },
      subject: "Invoice 42",
      bodyText: "Please find the invoice attached.",
      bodyHtml: null,
      folderIds: ["INBOX"],
      isDraft: false,
      sentAt: new Date("2026-03-03T09:00:00.000Z"),
    });
    expect(sentAtSource).toBe("header");
  });

  it("emits a participant row per address with the mailbox owner marked as self", () => {
    const message = inboundMessage({
      cc: addressList({ address: "Ada@Partner.Test", name: "Ada Partner" }),
    });

    expect(normalizeMessage(message, CONTEXT).participants).toEqual([
      {
        companyId: "company-1",
        messagingThreadId: "thread-1",
        provider: "mail",
        providerUserId: "zoe@partner.test",
        identifier: "zoe@partner.test",
        displayName: "Zoe Partner",
        isSelf: false,
      },
      {
        companyId: "company-1",
        messagingThreadId: "thread-1",
        provider: "mail",
        providerUserId: "kim@acme.test",
        identifier: "kim@acme.test",
        displayName: "Kim Acme",
        isSelf: true,
      },
      {
        companyId: "company-1",
        messagingThreadId: "thread-1",
        provider: "mail",
        providerUserId: "ada@partner.test",
        identifier: "ada@partner.test",
        displayName: "Ada Partner",
        isSelf: false,
      },
    ]);
  });

  it("adds the mailbox owner as a participant even when no header mentions the address", () => {
    const message = inboundMessage({ to: addressList({ address: "list@partner.test" }) });
    const participants = normalizeMessage(message, CONTEXT).participants;

    expect(participants.map((participant) => participant.identifier)).toEqual([
      "zoe@partner.test",
      "list@partner.test",
      "kim@acme.test",
    ]);
    expect(participants.at(-1)).toMatchObject({ displayName: "Kim Acme", isSelf: true });
  });

  it("keeps the earliest participant row and fills in a display name a later header supplies", () => {
    const message = inboundMessage({
      from: addressList({ address: "zoe@partner.test" }),
      to: addressList({ address: "kim@acme.test" }, { address: "zoe@partner.test", name: "Zoe Partner" }),
    });
    const participants = normalizeMessage(message, CONTEXT).participants;

    expect(participants).toHaveLength(2);
    expect(participants.at(0)).toMatchObject({ identifier: "zoe@partner.test", displayName: "Zoe Partner" });
  });
});

describe("normalizeMessage direction", () => {
  it("reads a message from another address as inbound", () => {
    const { message } = normalizeMessage(inboundMessage(), CONTEXT);

    expect(message.direction).toBe("inbound");
    expect(message.sender.isSelf).toBe(false);
  });

  it("reads a message the connected mailbox sent as outbound whatever the case of the header", () => {
    const message = inboundMessage({
      from: addressList({ address: " KIM@Acme.Test ", name: "Kim Acme" }),
      to: addressList({ address: "zoe@partner.test" }),
      folderIds: ["Sent"],
    });
    const { message: record } = normalizeMessage(message, CONTEXT);

    expect(record.direction).toBe("outbound");
    expect(record.sender).toEqual({
      attendeeId: "kim@acme.test",
      identifier: "kim@acme.test",
      displayName: "Kim Acme",
      isSelf: true,
    });
  });

  it("treats a configured alias as the mailbox itself", () => {
    const message = inboundMessage({ from: addressList({ address: "sales@acme.test" }) });
    const withAlias = { ...CONTEXT, mailboxAliases: ["Sales@Acme.Test"] };

    expect(normalizeMessage(message, withAlias).message.direction).toBe("outbound");
    expect(normalizeMessage(message, CONTEXT).message.direction).toBe("inbound");
  });

  it("falls back to the sent folder only when the sender address is unusable", () => {
    const sentContext = { ...CONTEXT, sentFolderIds: ["[Gmail]/Sent Mail"] };
    const withoutSender = inboundMessage({ from: undefined, folderIds: ["[Gmail]/Sent Mail"] });
    const { message } = normalizeMessage(withoutSender, sentContext);

    expect(message.direction).toBe("outbound");
    expect(message.senderIdentifier).toBeNull();
    expect(message.sender).toEqual({ attendeeId: "", identifier: "", displayName: null, isSelf: true });
  });

  it("keeps an inbound mail filed into the sent folder inbound, because the sender wins", () => {
    const sentContext = { ...CONTEXT, sentFolderIds: ["[Gmail]/Sent Mail"] };
    const filed = inboundMessage({ folderIds: ["[Gmail]/Sent Mail"] });

    expect(normalizeMessage(filed, sentContext).message.direction).toBe("inbound");
  });
});

describe("normalizeMessage recipients", () => {
  it("keeps an address that appears in both to and cc on the to list only", () => {
    const message = inboundMessage({
      to: addressList({ address: "Kim@Acme.Test", name: "Kim Acme" }, { address: "ada@partner.test" }),
      cc: addressList({ address: "kim@acme.test" }, { address: "ADA@partner.test" }, { address: "ivy@partner.test" }),
    });
    const { recipients } = normalizeMessage(message, CONTEXT).message;

    expect(recipients.to.map((attendee) => attendee.identifier)).toEqual(["kim@acme.test", "ada@partner.test"]);
    expect(recipients.cc.map((attendee) => attendee.identifier)).toEqual(["ivy@partner.test"]);
  });

  it("collapses an address repeated inside one header without merging the two headers", () => {
    const message = inboundMessage({
      to: addressList({ address: "ada@partner.test" }, { address: " ada@partner.test " }),
      cc: addressList({ address: "ivy@partner.test" }, { address: "Ivy@Partner.Test" }),
    });
    const { recipients } = normalizeMessage(message, CONTEXT).message;

    expect(recipients.to).toHaveLength(1);
    expect(recipients.cc).toHaveLength(1);
  });

  it("always writes the three recipient keys as arrays so the inbox can read the row", () => {
    const { recipients } = normalizeMessage({}, CONTEXT).message;

    expect(recipients).toEqual({ to: [], cc: [], bcc: [] });
  });

  it("drops bcc on an inbound message and keeps it on an outbound copy", () => {
    const bcc = addressList({ address: "audit@acme.test" });
    const inbound = normalizeMessage(inboundMessage({ bcc }), CONTEXT).message;
    const outbound = normalizeMessage(
      inboundMessage({ bcc, from: addressList({ address: "kim@acme.test" }) }),
      CONTEXT,
    ).message;

    expect(inbound.recipients.bcc).toEqual([]);
    expect(outbound.recipients.bcc).toEqual([
      { attendeeId: "audit@acme.test", identifier: "audit@acme.test", displayName: null },
    ]);
  });

  it("flattens an address group and a header parsed as a list of address objects", () => {
    const message = inboundMessage({
      to: [
        addressList({ address: "ada@partner.test" }),
        { value: [{ name: "Team", group: [{ address: "ivy@partner.test", name: "Ivy Partner" }] }] },
      ],
    });
    const { recipients } = normalizeMessage(message, CONTEXT).message;

    expect(recipients.to.map((attendee) => attendee.identifier)).toEqual(["ada@partner.test", "ivy@partner.test"]);
  });
});

describe("normalizeMessage subject and body", () => {
  it("leaves the subject null when the header is absent or blank", () => {
    expect(normalizeMessage(inboundMessage({ subject: undefined }), CONTEXT).message.subject).toBeNull();
    expect(normalizeMessage(inboundMessage({ subject: "   " }), CONTEXT).message.subject).toBeNull();
  });

  it("keeps the subject verbatim, reply prefix and all", () => {
    const message = inboundMessage({ subject: "  Re: Invoice 42  " });

    expect(normalizeMessage(message, CONTEXT).message.subject).toBe("Re: Invoice 42");
  });

  it("stores a text-only body as bodyText and leaves bodyHtml null", () => {
    const message = inboundMessage({ text: "  Hello there  ", html: false });
    const { message: record } = normalizeMessage(message, CONTEXT);

    expect(record.bodyText).toBe("Hello there");
    expect(record.bodyHtml).toBeNull();
  });

  it("renders a plain-text body from an html-only message", () => {
    const message = inboundMessage({
      text: undefined,
      html: "<style>p{color:red}</style><p>Hello <b>world</b></p><p>&amp; again&nbsp;</p>",
    });
    const { message: record } = normalizeMessage(message, CONTEXT);

    expect(record.bodyHtml).toBe("<style>p{color:red}</style><p>Hello <b>world</b></p><p>&amp; again&nbsp;</p>");
    expect(record.bodyText).toBe("Hello world\n& again");
  });

  it("keeps both bodies when the message carries a plain part and an html part", () => {
    const message = inboundMessage({ text: "Hello there", html: "<p>Hello there</p>" });
    const { message: record } = normalizeMessage(message, CONTEXT);

    expect(record.bodyText).toBe("Hello there");
    expect(record.bodyHtml).toBe("<p>Hello there</p>");
  });

  it("leaves both bodies null when the message carries neither part", () => {
    const message = inboundMessage({ text: undefined, html: undefined });
    const { message: record } = normalizeMessage(message, CONTEXT);

    expect(record.bodyText).toBeNull();
    expect(record.bodyHtml).toBeNull();
  });

  it("treats a whitespace-only body as no body at all", () => {
    const message = inboundMessage({ text: "   \n  ", html: "  <p>   </p>  " });
    const { message: record } = normalizeMessage(message, CONTEXT);

    expect(record.bodyText).toBeNull();
    expect(record.bodyHtml).toBe("<p>   </p>");
  });
});

describe("normalizeMessage sentAt", () => {
  it("prefers the date header when it is plausible", () => {
    const { message, sentAtSource } = normalizeMessage(inboundMessage(), CONTEXT);

    expect(message.sentAt).toEqual(new Date("2026-03-03T09:00:00.000Z"));
    expect(sentAtSource).toBe("header");
  });

  it("falls back to the received timestamp when the date header cannot be parsed", () => {
    const message = inboundMessage({ date: "not a date" });
    const { message: record, sentAtSource } = normalizeMessage(message, CONTEXT);

    expect(record.sentAt).toEqual(RECEIVED_AT);
    expect(sentAtSource).toBe("received");
  });

  it("rejects a date header that predates email or sits far beyond the received timestamp", () => {
    const ancient = normalizeMessage(inboundMessage({ date: "1974-01-01T00:00:00.000Z" }), CONTEXT);
    const future = normalizeMessage(inboundMessage({ date: "2099-01-01T00:00:00.000Z" }), CONTEXT);

    expect(ancient.message.sentAt).toEqual(RECEIVED_AT);
    expect(future.message.sentAt).toEqual(RECEIVED_AT);
    expect(ancient.sentAtSource).toBe("received");
    expect(future.sentAtSource).toBe("received");
  });

  it("accepts a date header inside the clock-skew window", () => {
    const message = inboundMessage({ date: "2026-03-04T09:00:00.000Z" });

    expect(normalizeMessage(message, CONTEXT).message.sentAt).toEqual(new Date("2026-03-04T09:00:00.000Z"));
  });

  it("still produces a usable sentAt when the message carries no date at all", () => {
    const message = inboundMessage({ date: undefined, receivedAt: undefined });
    const { message: record, sentAtSource } = normalizeMessage(message, CONTEXT);

    expect(record.sentAt).toEqual(new Date(0));
    expect(sentAtSource).toBe("epochFallback");
  });

  it("always produces a sentAt Postgres can store, whatever the date fields hold", () => {
    const unstorable = [1e20, -1e20, 8.64e15 + 1, Number.MAX_VALUE, new Date(Number.NaN), "275760-09-14"];

    for (const value of unstorable) {
      const fromHeader = normalizeMessage(inboundMessage({ date: value, receivedAt: undefined }), CONTEXT);
      const fromReceived = normalizeMessage(inboundMessage({ receivedAt: value }), CONTEXT);

      expect(Number.isFinite(fromHeader.message.sentAt.getTime())).toBe(true);
      expect(Number.isFinite(fromReceived.message.sentAt.getTime())).toBe(true);
    }
  });

  it("keeps the date header when only the received timestamp is unusable", () => {
    const { message, sentAtSource } = normalizeMessage(inboundMessage({ receivedAt: 1e20 }), CONTEXT);

    expect(message.sentAt).toEqual(new Date("2026-03-03T09:00:00.000Z"));
    expect(sentAtSource).toBe("header");
  });

  it("clamps a far-future date header back to the received timestamp", () => {
    const { message, sentAtSource } = normalizeMessage(inboundMessage({ date: "2999-01-01T00:00:00Z" }), CONTEXT);

    expect(message.sentAt).toEqual(RECEIVED_AT);
    expect(sentAtSource).toBe("received");
  });

  it("repeats the same fallback on every poll so a re-sync writes an identical row", () => {
    const message = inboundMessage({ date: "", receivedAt: "nonsense" });
    const first = normalizeMessage(message, CONTEXT).message.sentAt;
    const second = normalizeMessage(message, CONTEXT).message.sentAt;

    expect(first).toEqual(second);
    expect(first.getTime()).toBe(0);
  });
});

describe("normalizeMessage identity", () => {
  it("keeps the case of the message id and strips its angle brackets", () => {
    const message = inboundMessage({ messageId: "  <CAF9xAbC@Mail.Example>  " });

    expect(normalizeMessage(message, CONTEXT).message.unipileMessageId).toBe("imap:msg:id:CAF9xAbC@Mail.Example");
  });

  it("cannot let a forged message id land in the content-fingerprint namespace", () => {
    const undatable = inboundMessage({ messageId: undefined, date: undefined, receivedAt: undefined });
    const fingerprinted = normalizeMessage(undatable, CONTEXT).message.unipileMessageId;
    const forged = inboundMessage({ messageId: `<${fingerprinted.replace("imap:msg:", "")}>` });

    expect(fingerprinted).toMatch(/^imap:msg:sha256:[0-9a-f]{64}$/);
    expect(normalizeMessage(forged, CONTEXT).message.unipileMessageId).not.toBe(fingerprinted);
  });

  it("hashes a message id too long for the unique index instead of passing it through", () => {
    const huge = `<${"a".repeat(4000)}@mail.example>`;
    const { unipileMessageId } = normalizeMessage(inboundMessage({ messageId: huge }), CONTEXT).message;

    expect(unipileMessageId).toMatch(/^imap:msg:id-sha256:[0-9a-f]{64}$/);
    expect(unipileMessageId.length).toBeLessThan(200);
  });

  it("keeps a hashed long message id distinct per message id", () => {
    const first = inboundMessage({ messageId: `<${"a".repeat(4000)}@mail.example>` });
    const second = inboundMessage({ messageId: `<${"a".repeat(4000)}b@mail.example>` });

    expect(normalizeMessage(first, CONTEXT).message.unipileMessageId).not.toBe(
      normalizeMessage(second, CONTEXT).message.unipileMessageId,
    );
  });

  it("fingerprints the content when the message carries no message id", () => {
    const message = inboundMessage({ messageId: undefined });
    const { unipileMessageId } = normalizeMessage(message, CONTEXT).message;

    expect(unipileMessageId).toMatch(/^imap:msg:sha256:[0-9a-f]{64}$/);
    expect(normalizeMessage(message, CONTEXT).message.unipileMessageId).toBe(unipileMessageId);
  });

  it("keeps the fingerprint stable when the message moves to another folder", () => {
    const inInbox = inboundMessage({ messageId: undefined });
    const moved = inboundMessage({
      messageId: undefined,
      folderIds: ["Archive"],
      providerMessageId: "Archive:1699887766:12",
    });

    expect(normalizeMessage(moved, CONTEXT).message.unipileMessageId).toBe(
      normalizeMessage(inInbox, CONTEXT).message.unipileMessageId,
    );
  });

  it("fingerprints two different mails differently", () => {
    const first = inboundMessage({ messageId: undefined, subject: "Invoice 42" });
    const second = inboundMessage({ messageId: undefined, subject: "Invoice 43" });

    expect(normalizeMessage(first, CONTEXT).message.unipileMessageId).not.toBe(
      normalizeMessage(second, CONTEXT).message.unipileMessageId,
    );
  });

  it("marks a draft from the parsed flag and defaults to false", () => {
    expect(normalizeMessage(inboundMessage({ isDraft: true }), CONTEXT).message.isDraft).toBe(true);
    expect(normalizeMessage(inboundMessage(), CONTEXT).message.isDraft).toBe(false);
  });
});

describe("normalizeMessage malformed input", () => {
  it("drops address entries that are not usable addresses", () => {
    const message = {
      from: addressList({ address: "zoe@partner.test" }),
      to: {
        value: [
          null,
          "kim@acme.test",
          { address: 42 },
          { name: "No Address At All" },
          { address: "not-an-address" },
          { address: "two@@dots.test" },
          { address: "trailing@dot." },
          { address: '"Ada" <Ada@Partner.Test>', name: "Ada Partner" },
        ],
      },
    } as unknown as ParsedMailboxMessage;
    const { recipients } = normalizeMessage(message, CONTEXT).message;

    expect(recipients.to).toEqual([
      { attendeeId: "ada@partner.test", identifier: "ada@partner.test", displayName: "Ada Partner" },
    ]);
  });

  it("produces a best-effort record instead of throwing on a wholly malformed message", () => {
    const garbage = {
      messageId: 12,
      from: "not-an-object",
      to: [{ value: "not-a-list" }],
      cc: 5,
      bcc: true,
      subject: 9,
      date: "yesterday",
      text: 42,
      html: false,
      receivedAt: "nonsense",
      folderIds: "INBOX",
      providerMessageId: 0,
      isDraft: "yes",
    } as unknown as ParsedMailboxMessage;
    const { message, participants } = normalizeMessage(garbage, CONTEXT);

    expect(message.unipileMessageId).toMatch(/^imap:msg:sha256:[0-9a-f]{64}$/);
    expect(message.direction).toBe("inbound");
    expect(message.senderIdentifier).toBeNull();
    expect(message.subject).toBeNull();
    expect(message.bodyText).toBeNull();
    expect(message.folderIds).toEqual([]);
    expect(message.providerMessageId).toBeNull();
    expect(message.isDraft).toBe(false);
    expect(message.sentAt).toEqual(new Date(0));
    expect(participants).toEqual([
      {
        companyId: "company-1",
        messagingThreadId: "thread-1",
        provider: "mail",
        providerUserId: "kim@acme.test",
        identifier: "kim@acme.test",
        displayName: "Kim Acme",
        isSelf: true,
      },
    ]);
  });

  it("survives an empty message and a self-referencing address list", () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);

    expect(() => normalizeMessage({}, CONTEXT)).not.toThrow();
    expect(() => normalizeMessage({ to: cyclic } as unknown as ParsedMailboxMessage, CONTEXT)).not.toThrow();
  });

  it("rejects an address too long for the participant unique index", () => {
    const huge = `${"a".repeat(400)}@partner.test`;
    const { message, participants } = normalizeMessage(
      inboundMessage({ from: addressList({ address: huge }), to: addressList({ address: huge }) }),
      CONTEXT,
    );

    expect(message.senderIdentifier).toBeNull();
    expect(message.recipients.to).toEqual([]);
    expect(participants.every((participant) => participant.identifier.length <= 320)).toBe(true);
  });

  it("caps a recipient header instead of exploding on it", () => {
    const value = Array.from({ length: 200000 }, (_, index) => ({ address: `u${index}@partner.test` }));
    const message = { to: { value: [{ name: "Everyone", group: value }] } } as unknown as ParsedMailboxMessage;
    const { recipients } = normalizeMessage(message, CONTEXT).message;

    expect(recipients.to.length).toBeGreaterThan(0);
    expect(recipients.to.length).toBeLessThanOrEqual(1000);
  });

  it("caps a header repeated hundreds of times, not just one oversized header", () => {
    const to = Array.from({ length: 500 }, (_, header) => ({
      value: Array.from({ length: 200 }, (_, index) => ({ address: `u${header}-${index}@partner.test` })),
    }));
    const { message: record, participants } = normalizeMessage({ to } as ParsedMailboxMessage, CONTEXT);

    expect(record.recipients.to.length).toBeLessThanOrEqual(1000);
    expect(participants.length).toBeLessThanOrEqual(1001);
  }, 5000);

  it("renders plain text from hostile html without stalling the sync", () => {
    const hostile = ["<script".repeat(60000), "<".repeat(200000), "<br".repeat(100000), "<a ".repeat(66000)];

    for (const html of hostile) {
      const { bodyText } = normalizeMessage(inboundMessage({ text: undefined, html }), CONTEXT).message;

      expect(bodyText === null || typeof bodyText === "string").toBe(true);
    }
  }, 5000);

  it("drops an unterminated hidden block instead of scanning it repeatedly", () => {
    const message = inboundMessage({ text: undefined, html: `<p>Hello</p><style>${"a".repeat(50000)}` });

    expect(normalizeMessage(message, CONTEXT).message.bodyText).toBe("Hello");
  }, 5000);

  it("drops the body of an unclosed script block rather than leaking it into the text", () => {
    const message = inboundMessage({ text: undefined, html: "<p>Hello</p><script>var secret = 1;" });

    expect(normalizeMessage(message, CONTEXT).message.bodyText).toBe("Hello");
  });

  it("survives a mailbox address the operator configured badly", () => {
    const broken = { ...CONTEXT, mailboxAddress: "not-an-address", mailboxAliases: null };
    const { message, participants } = normalizeMessage(inboundMessage(), broken);

    expect(message.direction).toBe("inbound");
    expect(participants.every((participant) => !participant.isSelf)).toBe(true);
  });
});

describe("normalizeAddress", () => {
  it("trims and lowercases the address it uses as the participant identifier", () => {
    expect(normalizeAddress("  Kim@Acme.Test  ")).toBe("kim@acme.test");
    expect(normalizeAddress("Kim Acme <Kim@Acme.Test>")).toBe("kim@acme.test");
  });

  it("rejects anything that is not a routable address", () => {
    expect(normalizeAddress("kim")).toBeNull();
    expect(normalizeAddress("kim@localhost")).toBeNull();
    expect(normalizeAddress("kim@acme.test, ada@acme.test")).toBeNull();
    expect(normalizeAddress("")).toBeNull();
    expect(normalizeAddress(undefined)).toBeNull();
    expect(normalizeAddress(42)).toBeNull();
  });
});
