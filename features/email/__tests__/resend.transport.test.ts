import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";

const mockEnv = vi.hoisted(() => ({
  RESEND_API_KEY: "test-key" as string | undefined,
}));
const resendSend = vi.hoisted(() => vi.fn());
const resendConstructor = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };

    constructor(apiKey: string) {
      resendConstructor(apiKey);
    }
  },
}));

import { ResendTransport } from "../resend.transport";

const message = {
  from: "Customermates <mail@customermates.com>",
  to: "recipient@example.com",
  subject: "Legal update",
  react: createElement("div", null, "Legal update") as unknown as ReactElement<Record<string, unknown>>,
};

describe("ResendTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.RESEND_API_KEY = "test-key";
  });

  it("returns the provider's message id when it accepts the email", async () => {
    resendSend.mockResolvedValue({ data: { id: "message-123" }, error: null });

    await expect(new ResendTransport().deliver(message)).resolves.toEqual({
      accepted: true,
      transport: "resend",
      providerMessageId: "message-123",
    });
    expect(resendConstructor).toHaveBeenCalledWith("test-key");
    expect(resendSend).toHaveBeenCalledWith({
      from: message.from,
      to: message.to,
      subject: message.subject,
      react: message.react,
    });
  });

  it("returns false when the provider rejects the email", async () => {
    resendSend.mockResolvedValue({ data: null, error: { message: "provider rejected request" } });

    await expect(new ResendTransport().deliver(message)).resolves.toEqual({
      accepted: false,
      transport: "resend",
      providerMessageId: null,
    });
  });

  it("forwards reply-to and headers such as List-Unsubscribe verbatim", async () => {
    resendSend.mockResolvedValue({ data: { id: "message-124" }, error: null });
    const headers = {
      "List-Unsubscribe": "<https://crm.example/u/abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    await new ResendTransport().deliver({ ...message, replyTo: "sales@example.com", headers });

    expect(resendSend).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "sales@example.com", headers }));
  });

  it("fails closed when the api key is absent", async () => {
    mockEnv.RESEND_API_KEY = undefined;

    await expect(new ResendTransport().deliver(message)).rejects.toThrow("RESEND_API_KEY is not configured");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("preserves an unexpected provider exception", async () => {
    const failure = new TypeError("email rendering failed");
    resendSend.mockRejectedValue(failure);

    await expect(new ResendTransport().deliver(message)).rejects.toBe(failure);
  });
});
