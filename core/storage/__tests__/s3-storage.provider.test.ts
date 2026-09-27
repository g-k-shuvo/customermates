import type { StorageConfig } from "../storage-config";

import { describe, expect, it, vi } from "vitest";

import { nullStorageProvider } from "../null-storage.provider";
import { createS3StorageProvider, objectPath } from "../s3-storage.provider";
import { StorageError, StorageFailure } from "../storage-provider";

const CONFIG: StorageConfig = {
  endpoint: "http://minio:9000",
  publicEndpoint: "https://files.example.com",
  bucket: "customermates-files",
  region: "us-east-1",
  accessKeyId: "access",
  secretAccessKey: "secret",
  maxUploadBytes: 1024,
};

const KEY = "company-1/recordFile/record-1/3f1c.pdf";
const NOW = () => new Date("2026-09-27T10:00:00Z");

function provider(respond: (request: Request) => Response | Promise<Response> = () => new Response(null)) {
  const requests: Request[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;
    requests.push(request);
    return await respond(request);
  });

  return {
    storage: createS3StorageProvider(CONFIG, { fetch: fetch as unknown as typeof globalThis.fetch, now: NOW }),
    requests,
  };
}

describe("S3 storage provider presigning", () => {
  it("presigns uploads on the public endpoint, path-style, with size and type signed and a 15-minute expiry", async () => {
    const { storage } = provider();

    const upload = await storage.presignUpload({ key: KEY, contentType: "application/pdf", byteSize: 512 });
    const url = new URL(upload.url);

    expect(url.origin).toBe("https://files.example.com");
    expect(url.pathname).toBe(`/customermates-files/${KEY}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(upload).toMatchObject({ method: "PUT", headers: { "content-type": "application/pdf" } });
    expect(upload.expiresAt).toEqual(new Date("2026-09-27T10:15:00Z"));
  });

  it("refuses to presign an upload outside the configured size limit", async () => {
    const { storage } = provider();

    await expect(storage.presignUpload({ key: KEY, contentType: "application/pdf", byteSize: 2048 })).rejects.toEqual(
      new StorageError(StorageFailure.rejected, "size outside the upload limit"),
    );
  });

  it("presigns downloads that force the disposition and type chosen by the caller", async () => {
    const { storage } = provider();

    const download = await storage.presignDownload({
      key: KEY,
      fileName: "Angebot.pdf",
      contentType: "application/pdf",
      disposition: "attachment",
    });
    const url = new URL(download.url);

    expect(url.searchParams.get("response-content-disposition")).toBe(
      "attachment; filename=\"Angebot.pdf\"; filename*=UTF-8''Angebot.pdf",
    );
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encodes each key segment but keeps the separators", () => {
    expect(objectPath("files", "a b/ü/x.pdf")).toBe("/files/a%20b/%C3%BC/x.pdf");
  });
});

describe("S3 storage provider requests", () => {
  it("stats an object on the internal endpoint with a signed request", async () => {
    const { storage, requests } = provider(
      () => new Response(null, { headers: { "content-length": "512", "content-type": "application/pdf" } }),
    );

    await expect(storage.statObject(KEY)).resolves.toEqual({ byteSize: 512, contentType: "application/pdf" });
    expect(new URL(requests[0].url).origin).toBe("http://minio:9000");
    expect(requests[0].method).toBe("HEAD");
    expect(requests[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=access\//);
  });

  it("reports a missing object as null on stat and as notFound on read", async () => {
    const { storage } = provider(() => new Response(null, { status: 404 }));

    await expect(storage.statObject(KEY)).resolves.toBeNull();
    await expect(storage.getObject(KEY)).rejects.toMatchObject({ failure: StorageFailure.notFound });
  });

  it("streams an object's body", async () => {
    const { storage } = provider(() => new Response("hello", { headers: { "content-type": "text/plain" } }));

    const object = await storage.getObject(KEY);

    expect(await new Response(object.body).text()).toBe("hello");
    expect(object.contentType).toBe("text/plain");
  });

  it("treats deleting an object that is already gone as done", async () => {
    const { storage } = provider(() => new Response(null, { status: 404 }));

    await expect(storage.deleteObject(KEY)).resolves.toBeUndefined();
  });

  it("maps refusals and outages to storage failures", async () => {
    await expect(
      provider(() => new Response(null, { status: 403 })).storage.putObject({
        key: KEY,
        body: new Uint8Array([1]),
        contentType: "text/plain",
      }),
    ).rejects.toMatchObject({ failure: StorageFailure.rejected });
    await expect(provider(() => new Response(null, { status: 503 })).storage.statObject(KEY)).rejects.toMatchObject({
      failure: StorageFailure.unavailable,
    });
    await expect(
      provider(() => Promise.reject(new TypeError("fetch failed"))).storage.statObject(KEY),
    ).rejects.toMatchObject({ failure: StorageFailure.unavailable });
  });

  it("gives up on a bucket that does not answer, instead of holding the request open", async () => {
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const storage = createS3StorageProvider(CONFIG, {
      fetch: hanging as unknown as typeof globalThis.fetch,
      now: NOW,
      requestTimeoutMs: 20,
    });

    await expect(storage.statObject(KEY)).rejects.toEqual(new StorageError(StorageFailure.unavailable, "AbortError"));
    await expect(storage.deleteObject(KEY)).rejects.toMatchObject({ failure: StorageFailure.unavailable });
  });
});

describe("null storage provider", () => {
  it("reports itself unconfigured and refuses every operation", async () => {
    expect(nullStorageProvider.configured).toBe(false);
    await expect(nullStorageProvider.statObject(KEY)).rejects.toMatchObject({ failure: StorageFailure.notConfigured });
    await expect(
      nullStorageProvider.presignUpload({ key: KEY, contentType: "application/pdf", byteSize: 1 }),
    ).rejects.toMatchObject({ failure: StorageFailure.notConfigured });
  });
});
