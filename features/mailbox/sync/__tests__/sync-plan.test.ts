import { describe, expect, it } from "vitest";

import type { ParsedSourceMessage } from "../parse-source";
import { ORPHAN_THREAD_KEY_PREFIX, planMailboxSync } from "../sync-plan";

type Overrides = {
  uid: number;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  subject?: string | null;
  date?: Date | null;
  participants?: string[];
};

function parsed(overrides: Overrides): ParsedSourceMessage {
  return {
    uid: overrides.uid,
    message: {
      messageId: overrides.messageId ?? null,
      subject: overrides.subject ?? null,
      date: overrides.date ?? null,
      folderIds: ["INBOX"],
      providerMessageId: String(overrides.uid),
    },
    threading: {
      messageId: overrides.messageId ?? null,
      inReplyTo: overrides.inReplyTo ?? null,
      references: overrides.references ?? [],
      subject: overrides.subject ?? null,
      participants: overrides.participants ?? [],
    },
  };
}

describe("planMailboxSync", () => {
  it("groups a reply with the message it answers", () => {
    const plan = planMailboxSync([
      parsed({ uid: 1, messageId: "<root@vendor.example>", subject: "Quote" }),
      parsed({ uid: 2, messageId: "<reply@buyer.example>", inReplyTo: "<root@vendor.example>", subject: "Re: Quote" }),
    ]);

    expect(plan.threads).toHaveLength(1);
    expect(plan.threads[0].messages.map((entry) => entry.uid)).toEqual([1, 2]);
    expect(plan.messageCount).toBe(2);
  });

  it("groups a deep chain through References onto the original root", () => {
    const plan = planMailboxSync([
      parsed({ uid: 1, messageId: "<root@vendor.example>", subject: "Quote" }),
      parsed({
        uid: 2,
        messageId: "<second@buyer.example>",
        references: ["<root@vendor.example>"],
        subject: "Re: Quote",
      }),
      parsed({
        uid: 3,
        messageId: "<third@vendor.example>",
        references: ["<root@vendor.example>", "<second@buyer.example>"],
        subject: "Re: Re: Quote",
      }),
    ]);

    expect(plan.threads).toHaveLength(1);
    expect(plan.threads[0].messages.map((entry) => entry.uid)).toEqual([1, 2, 3]);
  });

  it("keeps unrelated conversations apart", () => {
    const plan = planMailboxSync([
      parsed({ uid: 1, messageId: "<a@vendor.example>", subject: "Quote" }),
      parsed({ uid: 2, messageId: "<b@other.example>", subject: "Invoice" }),
    ]);

    expect(plan.threads).toHaveLength(2);
  });

  it("orders a thread by sent time rather than fetch order", () => {
    const plan = planMailboxSync([
      parsed({
        uid: 9,
        messageId: "<late@buyer.example>",
        inReplyTo: "<root@vendor.example>",
        date: new Date("2026-03-02T10:00:00Z"),
      }),
      parsed({ uid: 4, messageId: "<root@vendor.example>", date: new Date("2026-03-01T10:00:00Z") }),
    ]);

    expect(plan.threads[0].messages.map((entry) => entry.uid)).toEqual([4, 9]);
  });

  it("falls back to uid order when two messages share a timestamp", () => {
    const when = new Date("2026-03-01T10:00:00Z");
    const plan = planMailboxSync([
      parsed({ uid: 8, messageId: "<b@vendor.example>", inReplyTo: "<root@vendor.example>", date: when }),
      parsed({ uid: 3, messageId: "<a@vendor.example>", inReplyTo: "<root@vendor.example>", date: when }),
    ]);

    expect(plan.threads[0].messages.map((entry) => entry.uid)).toEqual([3, 8]);
  });

  it("takes the thread subject from the earliest message that has one", () => {
    const plan = planMailboxSync([
      parsed({
        uid: 2,
        messageId: "<reply@buyer.example>",
        inReplyTo: "<root@vendor.example>",
        subject: "Re: Original subject",
        date: new Date("2026-03-02T10:00:00Z"),
      }),
      parsed({
        uid: 1,
        messageId: "<root@vendor.example>",
        subject: "Original subject",
        date: new Date("2026-03-01T10:00:00Z"),
      }),
    ]);

    expect(plan.threads[0].subject).toBe("Original subject");
  });

  it("groups by normalised subject and participants when no message id survives", () => {
    const plan = planMailboxSync([
      parsed({ uid: 1, subject: "Renewal", participants: ["anna@buyer.example", "max@vendor.example"] }),
      parsed({ uid: 2, subject: "Re: Renewal", participants: ["max@vendor.example", "anna@buyer.example"] }),
    ]);

    expect(plan.threads).toHaveLength(1);
    expect(plan.threads[0].messages.map((entry) => entry.uid)).toEqual([1, 2]);
  });

  it("keeps a message with nothing to thread on rather than dropping it", () => {
    const plan = planMailboxSync([parsed({ uid: 77 })]);

    expect(plan.threads).toHaveLength(1);
    expect(plan.threads[0].threadKey).toBe(`${ORPHAN_THREAD_KEY_PREFIX}77`);
    expect(plan.messageCount).toBe(1);
  });

  it("gives two unthreadable messages their own conversations", () => {
    const plan = planMailboxSync([parsed({ uid: 1 }), parsed({ uid: 2 })]);

    expect(plan.threads).toHaveLength(2);
    expect(plan.messageCount).toBe(2);
  });

  it("returns an empty plan for an empty page", () => {
    expect(planMailboxSync([])).toEqual({ threads: [], messageCount: 0 });
  });

  it("never loses a message from the page", () => {
    const page = [
      parsed({ uid: 1, messageId: "<a@vendor.example>", subject: "One" }),
      parsed({ uid: 2, messageId: "<b@vendor.example>", inReplyTo: "<a@vendor.example>" }),
      parsed({ uid: 3, subject: "Two", participants: ["x@vendor.example"] }),
      parsed({ uid: 4 }),
    ];

    const plan = planMailboxSync(page);
    const seen = plan.threads.flatMap((thread) => thread.messages.map((entry) => entry.uid));

    expect(seen.sort((left, right) => left - right)).toEqual([1, 2, 3, 4]);
    expect(plan.messageCount).toBe(page.length);
  });
});
