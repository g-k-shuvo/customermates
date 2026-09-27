export type StorageConfig = {
  endpoint: string;
  publicEndpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  maxUploadBytes: number;
};

export const STORAGE_DEFAULT_REGION = "us-east-1";
export const STORAGE_DEFAULT_MAX_UPLOAD_MB = 25;
export const STORAGE_MAX_UPLOAD_MB_CEILING = 5120;
export const STORAGE_PRESIGN_TTL_SECONDS = 900;

const REQUIRED = ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"] as const;
const OPTIONAL = ["STORAGE_PUBLIC_ENDPOINT", "STORAGE_REGION", "STORAGE_MAX_UPLOAD_MB"] as const;
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

type Source = Readonly<Record<string, string | undefined>>;

function read(source: Source, name: string): string | undefined {
  const value = source[name]?.trim();
  return value ? value : undefined;
}

function endpointOf(value: string, name: string): string {
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

function maxUploadBytesOf(value: string | undefined): number {
  if (value === undefined) return STORAGE_DEFAULT_MAX_UPLOAD_MB * 1024 * 1024;

  const megabytes = Number(value);
  if (!Number.isInteger(megabytes) || megabytes < 1 || megabytes > STORAGE_MAX_UPLOAD_MB_CEILING)
    throw new Error(`STORAGE_MAX_UPLOAD_MB must be a whole number between 1 and ${STORAGE_MAX_UPLOAD_MB_CEILING}`);

  return megabytes * 1024 * 1024;
}

export function resolveStorageConfig(source: Source): StorageConfig | null {
  const mentioned = [...REQUIRED, ...OPTIONAL].some((name) => read(source, name) !== undefined);
  if (!mentioned) return null;

  const missing = REQUIRED.filter((name) => read(source, name) === undefined);
  if (missing.length > 0)
    throw new Error(`Storage is partly configured: set ${missing.join(", ")} too, or unset every STORAGE_* variable`);

  const bucket = read(source, "STORAGE_BUCKET") as string;
  if (!BUCKET_NAME.test(bucket)) throw new Error("STORAGE_BUCKET is not a valid bucket name");

  const endpoint = endpointOf(read(source, "STORAGE_ENDPOINT") as string, "STORAGE_ENDPOINT");
  const publicEndpointValue = read(source, "STORAGE_PUBLIC_ENDPOINT");

  return {
    endpoint,
    publicEndpoint: publicEndpointValue ? endpointOf(publicEndpointValue, "STORAGE_PUBLIC_ENDPOINT") : endpoint,
    bucket,
    region: read(source, "STORAGE_REGION") ?? STORAGE_DEFAULT_REGION,
    accessKeyId: read(source, "STORAGE_ACCESS_KEY_ID") as string,
    secretAccessKey: read(source, "STORAGE_SECRET_ACCESS_KEY") as string,
    maxUploadBytes: maxUploadBytesOf(read(source, "STORAGE_MAX_UPLOAD_MB")),
  };
}
