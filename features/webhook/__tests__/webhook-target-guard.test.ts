import { describe, expect, it, vi } from "vitest";

import { checkWebhookTarget, isPublicWebhookUrl } from "../webhook-target-guard";

const resolvingTo = (...addresses: string[]) =>
  vi.fn(() => Promise.resolve(addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))));

describe("isPublicWebhookUrl", () => {
  it.each([
    "http://127.0.0.1:4777/hook",
    "http://localhost/hook",
    "http://10.0.0.5/hook",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/hook",
    "http://192.168.1.10/hook",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isPublicWebhookUrl(url)).toBe(false);
  });

  it("accepts a public hostname and a public address", () => {
    expect(isPublicWebhookUrl("https://hooks.example.com/in")).toBe(true);
    expect(isPublicWebhookUrl("https://93.184.216.34/in")).toBe(true);
  });

  it("accepts anything when the installation allows private hosts", () => {
    expect(isPublicWebhookUrl("http://127.0.0.1:4777/hook", { allowPrivateHosts: true })).toBe(true);
  });
});

describe("checkWebhookTarget", () => {
  it("allows a hostname that resolves to public addresses only", async () => {
    await expect(
      checkWebhookTarget("https://hooks.example.com/in", { resolveAddresses: resolvingTo("93.184.216.34") }),
    ).resolves.toBe("allowed");
  });

  it("refuses a public hostname whose answer points inside the network", async () => {
    await expect(
      checkWebhookTarget("https://hooks.example.com/in", {
        resolveAddresses: resolvingTo("93.184.216.34", "169.254.169.254"),
      }),
    ).resolves.toBe("refused");
  });

  it("refuses a private literal without asking DNS", async () => {
    const lookup = resolvingTo("93.184.216.34");

    await expect(checkWebhookTarget("http://127.0.0.1/hook", { resolveAddresses: lookup })).resolves.toBe("refused");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("reports a name that does not resolve separately from a refusal", async () => {
    await expect(
      checkWebhookTarget("https://nowhere.example.com/in", {
        resolveAddresses: vi.fn(() => Promise.reject(new Error("ENOTFOUND"))),
      }),
    ).resolves.toBe("unresolvable");
  });

  it("allows private targets when the installation opts in", async () => {
    await expect(checkWebhookTarget("http://127.0.0.1/hook", { allowPrivateHosts: true })).resolves.toBe("allowed");
  });
});
