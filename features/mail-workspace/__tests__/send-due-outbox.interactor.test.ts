import { describe, expect, it, vi } from "vitest";

import type { DueOutboxMessage } from "../mail-workspace.repo";
import type { OutboxDelivery } from "../outbox/send-due-outbox.interactor";

import { MAIL_OUTBOX_RETRY_DELAY_MS } from "../mail-workspace.schema";
import { OUTBOX_UNEXPECTED_ERROR, SendDueOutboxInteractor } from "../outbox/send-due-outbox.interactor";

const NOW = new Date("2026-10-01T09:00:00Z");

function message(id: string, attempts = 0): DueOutboxMessage {
  return {
    id,
    companyId: "company-1",
    userId: "user-1",
    threadId: `thread-${id}`,
    mode: "reply",
    replyAll: false,
    body: "Hello",
    recipients: [],
    attempts,
  };
}

function harness(due: DueOutboxMessage[], deliver: OutboxDelivery) {
  const repo = {
    claimDueOutboxMessagesUnscoped: vi.fn().mockResolvedValue(due),
    markOutboxSentUnscoped: vi.fn().mockResolvedValue(undefined),
    markOutboxAttemptFailedUnscoped: vi.fn().mockResolvedValue(undefined),
  };

  return { repo, interactor: new SendDueOutboxInteractor(repo, deliver, () => NOW) };
}

describe("SendDueOutboxInteractor", () => {
  it("claims due messages, reclaiming ones stuck in sending for ten minutes", async () => {
    const { repo, interactor } = harness([], () => Promise.resolve({ ok: true }));

    await interactor.invoke();

    expect(repo.claimDueOutboxMessagesUnscoped).toHaveBeenCalledWith(NOW, new Date("2026-10-01T08:50:00Z"), 25);
  });

  it("marks a delivered message sent", async () => {
    const { repo, interactor } = harness([message("a")], () => Promise.resolve({ ok: true }));

    const result = await interactor.invoke();

    expect(result).toEqual({ ok: true, data: { sent: 1, retried: 0, failed: 0 } });
    expect(repo.markOutboxSentUnscoped).toHaveBeenCalledWith(message("a"), NOW);
  });

  it("retries a failed delivery with a growing delay, then gives up on the third attempt", async () => {
    const deliver = vi.fn<OutboxDelivery>(() => Promise.resolve({ ok: false, error: "mailboxUnreachable" }));
    const { repo, interactor } = harness([message("first"), message("second", 1), message("last", 2)], deliver);

    const result = await interactor.invoke();

    expect(result).toEqual({ ok: true, data: { sent: 0, retried: 2, failed: 1 } });
    expect(repo.markOutboxAttemptFailedUnscoped.mock.calls).toEqual([
      [
        message("first"),
        { error: "mailboxUnreachable", retryAt: new Date(NOW.getTime() + MAIL_OUTBOX_RETRY_DELAY_MS) },
      ],
      [
        message("second", 1),
        { error: "mailboxUnreachable", retryAt: new Date(NOW.getTime() + 2 * MAIL_OUTBOX_RETRY_DELAY_MS) },
      ],
      [message("last", 2), { error: "mailboxUnreachable", retryAt: null }],
    ]);
  });

  it("treats a delivery that throws as an unexpected failure and keeps going", async () => {
    const deliver = vi
      .fn<OutboxDelivery>()
      .mockRejectedValueOnce(new Error("socket closed"))
      .mockResolvedValueOnce({ ok: true });
    const { repo, interactor } = harness([message("boom"), message("fine")], deliver);

    const result = await interactor.invoke();

    expect(result).toEqual({ ok: true, data: { sent: 1, retried: 1, failed: 0 } });
    expect(repo.markOutboxAttemptFailedUnscoped).toHaveBeenCalledWith(
      message("boom"),
      expect.objectContaining({ error: OUTBOX_UNEXPECTED_ERROR }),
    );
  });
});
