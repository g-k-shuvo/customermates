export type SigningConfig = {
  integrationKey: string;
  userId: string;
  privateKey: string;
  authServer: string;
  accountId: string | null;
  connectHmacSecret: string;
};

export const DOCUSIGN_DEFAULT_AUTH_SERVER = "https://account.docusign.com";

const REQUIRED = [
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_PRIVATE_KEY",
  "DOCUSIGN_CONNECT_HMAC_SECRET",
] as const;
const OPTIONAL = ["DOCUSIGN_AUTH_SERVER", "DOCUSIGN_ACCOUNT_ID"] as const;
const PEM_PRIVATE_KEY = /-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----/;

type Source = Readonly<Record<string, string | undefined>>;

function read(source: Source, name: string): string | undefined {
  const value = source[name]?.trim();
  return value ? value : undefined;
}

function originOf(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${name} must use http or https`);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error(`${name} must be an origin without a path`);

  return url.origin;
}

export function resolveSigningConfig(source: Source): SigningConfig | null {
  const mentioned = [...REQUIRED, ...OPTIONAL].some((name) => read(source, name) !== undefined);
  if (!mentioned) return null;

  const missing = REQUIRED.filter((name) => read(source, name) === undefined);
  if (missing.length > 0)
    throw new Error(`DocuSign is partly configured: set ${missing.join(", ")} too, or unset every DOCUSIGN_* variable`);

  const privateKey = (read(source, "DOCUSIGN_PRIVATE_KEY") as string).replace(/\\n/g, "\n");
  if (!PEM_PRIVATE_KEY.test(privateKey)) throw new Error("DOCUSIGN_PRIVATE_KEY must be a PEM-encoded RSA private key");

  const authServer = read(source, "DOCUSIGN_AUTH_SERVER");

  return {
    integrationKey: read(source, "DOCUSIGN_INTEGRATION_KEY") as string,
    userId: read(source, "DOCUSIGN_USER_ID") as string,
    privateKey,
    authServer: authServer ? originOf(authServer, "DOCUSIGN_AUTH_SERVER") : DOCUSIGN_DEFAULT_AUTH_SERVER,
    accountId: read(source, "DOCUSIGN_ACCOUNT_ID") ?? null,
    connectHmacSecret: read(source, "DOCUSIGN_CONNECT_HMAC_SECRET") as string,
  };
}
