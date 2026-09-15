import { afterEach, describe, expect, it, vi } from "vitest";

async function loadBranding(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("APP_MODE", "self-hosted");
  vi.stubEnv("BASE_URL", "http://localhost:4000");
  vi.stubEnv("RESEND_OPERATOR_EMAIL", "operator@example.com");

  for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value);

  return (await import("@/core/config/branding")).branding;
}

describe("deployment branding", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps the upstream product name when no brand is configured", async () => {
    const branding = await loadBranding({ BRAND_NAME: undefined });

    expect(branding.name).toBe("Customermates");
  });

  it("ignores a blank brand name rather than rendering an empty product", async () => {
    const branding = await loadBranding({ BRAND_NAME: "   " });

    expect(branding.name).toBe("Customermates");
  });

  it("uses the configured brand name", async () => {
    const branding = await loadBranding({ BRAND_NAME: "AcmeCRM" });

    expect(branding.name).toBe("AcmeCRM");
  });

  it("falls back to the operator address when no support address is configured", async () => {
    const branding = await loadBranding({ BRAND_SUPPORT_EMAIL: undefined });

    expect(branding.supportEmail).toBe("operator@example.com");
  });

  it("prefers the configured support address", async () => {
    const branding = await loadBranding({ BRAND_SUPPORT_EMAIL: "support@acmecrm.com" });

    expect(branding.supportEmail).toBe("support@acmecrm.com");
  });

  it("leaves every deployment switch off when it is absent or blank", async () => {
    const branding = await loadBranding({
      AUTH_SOCIAL_LOGIN_DISABLED: undefined,
      MARKETING_CHROME_DISABLED: " ",
      VENDOR_HELP_DISABLED: undefined,
    });

    expect(branding.socialLoginDisabled).toBe(false);
    expect(branding.marketingChromeDisabled).toBe(false);
    expect(branding.vendorHelpDisabled).toBe(false);
  });

  it("accepts only explicit lowercase booleans", async () => {
    const enabled = await loadBranding({
      AUTH_SOCIAL_LOGIN_DISABLED: "true",
      MARKETING_CHROME_DISABLED: "true",
      VENDOR_HELP_DISABLED: "true",
    });

    expect(enabled.socialLoginDisabled).toBe(true);
    expect(enabled.marketingChromeDisabled).toBe(true);
    expect(enabled.vendorHelpDisabled).toBe(true);

    const disabled = await loadBranding({
      AUTH_SOCIAL_LOGIN_DISABLED: "false",
      MARKETING_CHROME_DISABLED: "false",
      VENDOR_HELP_DISABLED: "false",
    });

    expect(disabled.socialLoginDisabled).toBe(false);
    expect(disabled.marketingChromeDisabled).toBe(false);
    expect(disabled.vendorHelpDisabled).toBe(false);
  });

  it.each(["AUTH_SOCIAL_LOGIN_DISABLED", "MARKETING_CHROME_DISABLED", "VENDOR_HELP_DISABLED"])(
    "rejects an ambiguous %s value",
    async (name) => {
      await expect(loadBranding({ [name]: "1" })).rejects.toThrow(`${name} must be configured as "true" or "false"`);
    },
  );
});
