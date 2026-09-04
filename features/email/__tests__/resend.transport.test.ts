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

  it("returns true when the provider accepts the email", async () => {
    resendSend.mockResolvedValue({ data: { id: "message-123" }, error: null });

    await expect(new ResendTransport().send(message)).resolves.toBe(true);
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

    await expect(new ResendTransport().send(message)).resolves.toBe(false);
  });

  it("fails closed when the api key is absent", async () => {
    mockEnv.RESEND_API_KEY = undefined;

    await expect(new ResendTransport().send(message)).rejects.toThrow("RESEND_API_KEY is not configured");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("preserves an unexpected provider exception", async () => {
    const failure = new TypeError("email rendering failed");
    resendSend.mockRejectedValue(failure);

    await expect(new ResendTransport().send(message)).rejects.toBe(failure);
  });
});
