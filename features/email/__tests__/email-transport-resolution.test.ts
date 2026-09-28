import { describe, expect, it } from "vitest";

import { resolveEmailTransport } from "../email-transport";

describe("EMAIL_TRANSPORT resolution", () => {
  it("defaults to Resend in production and to the console transport elsewhere", () => {
    expect(resolveEmailTransport(undefined, "production")).toBe("resend");
    expect(resolveEmailTransport("", "development")).toBe("console");
    expect(resolveEmailTransport(undefined, "test")).toBe("console");
  });

  it("honours an explicit transport whatever the environment", () => {
    expect(resolveEmailTransport("resend", "development")).toBe("resend");
    expect(resolveEmailTransport("smtp", "production")).toBe("smtp");
    expect(resolveEmailTransport("console", "production")).toBe("console");
  });

  it("refuses an unknown transport at boot", () => {
    expect(() => resolveEmailTransport("sendgrid", "production")).toThrow(
      "EMAIL_TRANSPORT must be one of resend, smtp, console",
    );
  });
});
