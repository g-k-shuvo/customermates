import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "production" as "production" | "test",
  RESEND_OPERATOR_EMAIL: "mail@customermates.com",
  EMAIL_TRANSPORT: "resend" as "resend" | "smtp" | undefined,
}));
const resendSend = vi.hoisted(() => vi.fn());
const smtpSend = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("../resend.transport", () => ({
  ResendTransport: class {
    send = resendSend;
  },
}));
vi.mock("../smtp.transport", () => ({
  SmtpTransport: class {
    send = smtpSend;
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
    resendSend.mockResolvedValue(true);
    smtpSend.mockResolvedValue(true);
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
    smtpSend.mockResolvedValue(false);
    mockEnv.EMAIL_TRANSPORT = "smtp";

    await expect(new EmailService().send(email)).resolves.toBe(false);
  });

  it("does not reach any transport outside production", async () => {
    mockEnv.NODE_ENV = "test";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(new EmailService().send(email)).resolves.toBe(true);
    expect(resendSend).not.toHaveBeenCalled();
    expect(smtpSend).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
