import { describe, expect, it } from "vitest";

import { resolveStorageConfig, STORAGE_DEFAULT_REGION } from "../storage-config";

const COMPLETE = {
  STORAGE_ENDPOINT: "http://minio:9000",
  STORAGE_BUCKET: "customermates-files",
  STORAGE_ACCESS_KEY_ID: "access",
  STORAGE_SECRET_ACCESS_KEY: "secret",
};

describe("resolveStorageConfig", () => {
  it("returns null when no STORAGE_* variable is set, so an install without files still boots", () => {
    expect(resolveStorageConfig({})).toBeNull();
    expect(resolveStorageConfig({ STORAGE_ENDPOINT: "  " })).toBeNull();
  });

  it("refuses a partial configuration and names what is missing", () => {
    expect(() => resolveStorageConfig({ STORAGE_ENDPOINT: "http://minio:9000", STORAGE_BUCKET: "files" })).toThrow(
      "set STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY too",
    );
    expect(() => resolveStorageConfig({ STORAGE_REGION: "eu-central-1" })).toThrow("STORAGE_ENDPOINT");
  });

  it("defaults the public endpoint to the internal one, the region and the upload limit", () => {
    expect(resolveStorageConfig(COMPLETE)).toEqual({
      endpoint: "http://minio:9000",
      publicEndpoint: "http://minio:9000",
      bucket: "customermates-files",
      region: STORAGE_DEFAULT_REGION,
      accessKeyId: "access",
      secretAccessKey: "secret",
      maxUploadBytes: 25 * 1024 * 1024,
    });
  });

  it("keeps a separate public endpoint for presigning behind a proxy", () => {
    const config = resolveStorageConfig({
      ...COMPLETE,
      STORAGE_PUBLIC_ENDPOINT: "https://files.example.com/",
      STORAGE_REGION: "eu-central-1",
      STORAGE_MAX_UPLOAD_MB: "100",
    });

    expect(config).toMatchObject({
      publicEndpoint: "https://files.example.com",
      region: "eu-central-1",
      maxUploadBytes: 100 * 1024 * 1024,
    });
  });

  it.each([
    ["an endpoint with a path", { STORAGE_ENDPOINT: "http://minio:9000/bucket" }, "origin without a path"],
    ["a non-http endpoint", { STORAGE_ENDPOINT: "ftp://minio" }, "http or https"],
    ["a malformed endpoint", { STORAGE_ENDPOINT: "minio:9000" }, "http or https"],
    ["an invalid bucket", { STORAGE_BUCKET: "Files_Bucket" }, "not a valid bucket name"],
    ["a fractional upload limit", { STORAGE_MAX_UPLOAD_MB: "2.5" }, "whole number"],
    ["an upload limit beyond a single PUT", { STORAGE_MAX_UPLOAD_MB: "6000" }, "whole number"],
  ])("refuses %s", (_label, override, message) => {
    expect(() => resolveStorageConfig({ ...COMPLETE, ...override })).toThrow(message);
  });
});
