import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";

const mockEnv = vi.hoisted(() => ({
  EMAIL_SMTP_HOST: "smtp.example.com" as string | undefined,
  EMAIL_SMTP_PORT: 587,
  EMAIL_SMTP_USER: "mailer" as string | undefined,
  EMAIL_SMTP_PASSWORD: "secret" as string | undefined,
  EMAIL_SMTP_SECURE: false,
}));
const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("nodemailer", () => ({ createTransport }));
vi.mock("@react-email/components", () => ({ render: vi.fn().mockResolvedValue("<html>body</html>") }));

import { SmtpTransport } from "../smtp.transport";

const message = {
  from: "Customermates <mail@customermates.com>",
  to: "recipient@example.com",
  subject: "Legal update",
  react: createElement("div", null, "Legal update") as unknown as ReactElement<Record<string, unknown>>,
};

describe("SmtpTransport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.EMAIL_SMTP_HOST = "smtp.example.com";
    mockEnv.EMAIL_SMTP_USER = "mailer";
    mockEnv.EMAIL_SMTP_PASSWORD = "secret";
    mockEnv.EMAIL_SMTP_SECURE = false;
  });

  it("returns the message id when the server accepts the recipient", async () => {
    sendMail.mockResolvedValue({ accepted: ["recipient@example.com"], rejected: [], messageId: "<m-1@example.com>" });

    await expect(new SmtpTransport().deliver(message)).resolves.toEqual({
      accepted: true,
      transport: "smtp",
      providerMessageId: "<m-1@example.com>",
    });
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "mailer", pass: "secret" },
    });
  });

  it("renders the react body to html before sending", async () => {
    sendMail.mockResolvedValue({ accepted: ["recipient@example.com"], rejected: [] });

    await new SmtpTransport().deliver(message);

    expect(sendMail).toHaveBeenCalledWith({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: "<html>body</html>",
    });
  });

  it("returns false when the server accepts no recipient", async () => {
    sendMail.mockResolvedValue({ accepted: [], rejected: ["recipient@example.com"] });

    await expect(new SmtpTransport().deliver(message)).resolves.toMatchObject({ accepted: false });
  });

  it("forwards reply-to and headers such as List-Unsubscribe verbatim", async () => {
    sendMail.mockResolvedValue({ accepted: ["recipient@example.com"], rejected: [] });
    const headers = {
      "List-Unsubscribe": "<https://crm.example/u/abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    await new SmtpTransport().deliver({ ...message, replyTo: "sales@example.com", headers });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "sales@example.com", headers }));
  });

  it("omits auth when no user is configured", async () => {
    mockEnv.EMAIL_SMTP_USER = undefined;
    sendMail.mockResolvedValue({ accepted: ["recipient@example.com"], rejected: [] });

    await new SmtpTransport().deliver(message);

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it("fails closed when the host is absent", async () => {
    mockEnv.EMAIL_SMTP_HOST = undefined;

    await expect(new SmtpTransport().deliver(message)).rejects.toThrow("EMAIL_SMTP_HOST is not configured");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("preserves an unexpected transport exception", async () => {
    const failure = new TypeError("socket closed");
    sendMail.mockRejectedValue(failure);

    await expect(new SmtpTransport().deliver(message)).rejects.toBe(failure);
  });
});
