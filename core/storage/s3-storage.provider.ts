import type { StorageConfig } from "./storage-config";
import type { StorageProvider } from "./storage-provider";

import { AwsClient } from "aws4fetch";

import { STORAGE_PRESIGN_TTL_SECONDS } from "./storage-config";
import { StorageError, StorageFailure } from "./storage-provider";
import { contentDisposition } from "./upload-policy";

export const STORAGE_REQUEST_TIMEOUT_MS = 30_000;

export type S3StorageProviderOptions = {
  fetch?: typeof fetch;
  now?: () => Date;
  requestTimeoutMs?: number;
};

export function objectPath(bucket: string, key: string): string {
  return `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function failureForStatus(status: number): StorageError {
  if (status === 404) return new StorageError(StorageFailure.notFound);
  if (status === 400 || status === 403) return new StorageError(StorageFailure.rejected, `status ${status}`);

  return new StorageError(StorageFailure.unavailable, `status ${status}`);
}

type SignInit = {
  method: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
  aws?: { signQuery?: boolean; allHeaders?: boolean };
};

type RequestSigner = { sign(input: string, init: SignInit): Promise<Request> };

export function createS3StorageProvider(
  config: StorageConfig,
  options: S3StorageProviderOptions = {},
): StorageProvider {
  const signer: RequestSigner = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
    retries: 2,
  });
  const send = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const requestTimeoutMs = options.requestTimeoutMs ?? STORAGE_REQUEST_TIMEOUT_MS;
  const expiresAt = () => new Date(now().getTime() + STORAGE_PRESIGN_TTL_SECONDS * 1000);

  const internalUrl = (key: string) => new URL(objectPath(config.bucket, key), config.endpoint);
  const publicUrl = (key: string) => {
    const url = new URL(objectPath(config.bucket, key), config.publicEndpoint);
    url.searchParams.set("X-Amz-Expires", String(STORAGE_PRESIGN_TTL_SECONDS));
    return url;
  };

  const request = async (key: string, init: SignInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await send(await signer.sign(internalUrl(key).toString(), init), { signal: controller.signal });
    } catch (error) {
      throw new StorageError(StorageFailure.unavailable, (error as Error | null)?.name);
    } finally {
      clearTimeout(timer);
    }
  };

  const presign = async (url: URL, method: "GET" | "PUT", headers: Record<string, string> = {}): Promise<string> => {
    const signed = await signer.sign(url.toString(), { method, headers, aws: { signQuery: true, allHeaders: true } });
    return signed.url;
  };

  return {
    configured: true,
    maxUploadBytes: config.maxUploadBytes,

    presignUpload: async ({ key, contentType, byteSize }) => {
      if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > config.maxUploadBytes)
        throw new StorageError(StorageFailure.rejected, "size outside the upload limit");

      const url = await presign(publicUrl(key), "PUT", {
        "content-type": contentType,
        "content-length": String(byteSize),
      });

      return { url, method: "PUT" as const, headers: { "content-type": contentType }, expiresAt: expiresAt() };
    },

    presignDownload: async ({ key, fileName, contentType, disposition }) => {
      const url = publicUrl(key);
      url.searchParams.set("response-content-type", contentType);
      url.searchParams.set("response-content-disposition", contentDisposition(disposition, fileName));

      return { url: await presign(url, "GET"), expiresAt: expiresAt() };
    },

    statObject: async (key) => {
      const response = await request(key, { method: "HEAD" });
      if (response.status === 404) return null;
      if (!response.ok) throw failureForStatus(response.status);

      return {
        byteSize: Number(response.headers.get("content-length") ?? 0),
        contentType: response.headers.get("content-type"),
      };
    },

    getObject: async (key) => {
      const response = await request(key, { method: "GET" });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw failureForStatus(response.ok ? 404 : response.status);
      }

      return {
        body: response.body,
        byteSize: Number(response.headers.get("content-length") ?? 0),
        contentType: response.headers.get("content-type"),
      };
    },

    putObject: async ({ key, body, contentType }) => {
      const response = await request(key, { method: "PUT", body, headers: { "content-type": contentType } });
      await response.body?.cancel();
      if (!response.ok) throw failureForStatus(response.status);
    },

    deleteObject: async (key) => {
      const response = await request(key, { method: "DELETE" });
      await response.body?.cancel();
      if (!response.ok && response.status !== 404) throw failureForStatus(response.status);
    },
  };
}
