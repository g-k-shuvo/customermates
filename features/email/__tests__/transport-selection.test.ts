import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "production" as "production" | "test",
  RESEND_OPERATOR_EMAIL: "mail@customermates.com",
  EMAIL_TRANSPORT: "resend" as "resend" | "smtp" | "console" | undefined,
}));
const resendSend = vi.hoisted(() => vi.fn());
const smtpSend = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("../resend.transport", () => ({
  ResendTransport: class {
    deliver = resendSend;
  },
}));
vi.mock("../smtp.transport", () => ({
  SmtpTransport: class {
    deliver = smtpSend;
  },
}));

import { EmailService } from "../email.service";

const email: Parameters<EmailService["send"]>[0] = {
  to: "recipient@example.com",
  subject: "Legal update",
  react: createElement("div", null, "Legal update") as unknown as ReactElement<Record<string, unknown>>,
};

describe("EmailService transport selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.NODE_ENV = "production";
    mockEnv.EMAIL_TRANSPORT = "resend";
    resendSend.mockResolvedValue({ accepted: true, transport: "resend", providerMessageId: "r-1" });
    smtpSend.mockResolvedValue({ accepted: true, transport: "smtp", providerMessageId: null });
  });

  it("routes through Resend when the transport is resend", async () => {
    await expect(new EmailService().send(email)).resolves.toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it("routes through SMTP when the transport is smtp", async () => {
    mockEnv.EMAIL_TRANSPORT = "smtp";

    await expect(new EmailService().send(email)).resolves.toBe(true);
    expect(smtpSend).toHaveBeenCalledTimes(1);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("falls back to Resend when the transport is unset", async () => {
    mockEnv.EMAIL_TRANSPORT = undefined;

    await expect(new EmailService().send(email)).resolves.toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it("sends the resolved sender and message through to the transport", async () => {
    mockEnv.EMAIL_TRANSPORT = "smtp";

    await new EmailService().send(email);

    expect(smtpSend).toHaveBeenCalledWith({
      from: "Customermates <mail@customermates.com>",
      to: email.to,
      subject: email.subject,
      react: email.react,
    });
  });

  it("propagates a transport rejection as a false result", async () => {
    smtpSend.mockResolvedValue({ accepted: false, transport: "smtp", providerMessageId: null });
    mockEnv.EMAIL_TRANSPORT = "smtp";

    await expect(new EmailService().send(email)).resolves.toBe(false);
  });

  it("hands the provider's message id back from deliver", async () => {
    await expect(new EmailService().deliver(email)).resolves.toEqual({
      accepted: true,
      transport: "resend",
      providerMessageId: "r-1",
    });
  });

  it("sends through the configured transport outside production too", async () => {
    mockEnv.NODE_ENV = "test";

    await expect(new EmailService().send(email)).resolves.toBe(true);
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("writes to the console transport when it is the configured one, without reaching a provider", async () => {
    mockEnv.EMAIL_TRANSPORT = "console";
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(new EmailService().deliver(email)).resolves.toEqual({
      accepted: true,
      transport: "console",
      providerMessageId: null,
    });
    expect(String(write.mock.calls[0]?.[0])).toContain('"subject":"Legal update"');
    expect(resendSend).not.toHaveBeenCalled();
    expect(smtpSend).not.toHaveBeenCalled();
    write.mockRestore();
  });
});
