import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions", () => ({ cancelOutboxMessageAction: vi.fn(), sendOutboxMessageNowAction: vi.fn() }));

import { CustomErrorCode } from "@/core/validation/validation.types";

import { outboxFailureReason } from "../mail-thread-outbox";

const t = (key: string) => `t:${key}`;

describe("outboxFailureReason", () => {
  it("translates the error code a failed send stored", () => {
    expect(outboxFailureReason(CustomErrorCode.mailboxUnreachable, t)).toBe("t:Common.errors.mailboxUnreachable");
  });

  it("falls back to a general reason for anything that is not a known code", () => {
    expect(outboxFailureReason("unexpected", t)).toBe("t:Mailbox.workspace.outboxUnexpected");
  });

  it("shows nothing when no error was stored", () => {
    expect(outboxFailureReason(null, t)).toBeNull();
  });
});
