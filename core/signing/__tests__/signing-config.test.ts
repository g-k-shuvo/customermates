import { describe, expect, it } from "vitest";

import { DOCUSIGN_DEFAULT_AUTH_SERVER, resolveSigningConfig } from "../signing-config";

const KEY = "-----BEGIN RSA PRIVATE KEY-----\\nMIIBOgIBAAJBAK\\n-----END RSA PRIVATE KEY-----";
const COMPLETE = {
  DOCUSIGN_INTEGRATION_KEY: "integration-key",
  DOCUSIGN_USER_ID: "user-guid",
  DOCUSIGN_PRIVATE_KEY: KEY,
  DOCUSIGN_CONNECT_HMAC_SECRET: "connect-secret",
};

describe("resolveSigningConfig", () => {
  it("leaves signing off when nothing is set", () => {
    expect(resolveSigningConfig({})).toBeNull();
    expect(resolveSigningConfig({ DOCUSIGN_ACCOUNT_ID: "  " })).toBeNull();
  });

  it("reads a complete configuration, with the production auth server by default", () => {
    expect(resolveSigningConfig(COMPLETE)).toEqual({
      integrationKey: "integration-key",
      userId: "user-guid",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----",
      authServer: DOCUSIGN_DEFAULT_AUTH_SERVER,
      accountId: null,
      connectHmacSecret: "connect-secret",
    });
  });

  it("takes the sandbox auth server and an account", () => {
    expect(
      resolveSigningConfig({
        ...COMPLETE,
        DOCUSIGN_AUTH_SERVER: "https://account-d.docusign.com/",
        DOCUSIGN_ACCOUNT_ID: "acct-1",
      }),
    ).toMatchObject({ authServer: "https://account-d.docusign.com", accountId: "acct-1" });
  });

  it("names what is missing from a partial configuration", () => {
    expect(() => resolveSigningConfig({ DOCUSIGN_INTEGRATION_KEY: "integration-key" })).toThrow(
      "DocuSign is partly configured: set DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY, DOCUSIGN_CONNECT_HMAC_SECRET too, or unset every DOCUSIGN_* variable",
    );
  });

  it("refuses a key that is not PEM and an auth server with a path", () => {
    expect(() => resolveSigningConfig({ ...COMPLETE, DOCUSIGN_PRIVATE_KEY: "not a key" })).toThrow(
      "DOCUSIGN_PRIVATE_KEY must be a PEM-encoded RSA private key",
    );
    expect(() =>
      resolveSigningConfig({ ...COMPLETE, DOCUSIGN_AUTH_SERVER: "https://account.docusign.com/oauth" }),
    ).toThrow("DOCUSIGN_AUTH_SERVER must be an origin without a path");
  });
});
