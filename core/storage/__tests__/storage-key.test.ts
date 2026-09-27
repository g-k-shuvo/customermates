import { describe, expect, it } from "vitest";

import { mintStorageKey, storageKeyBelongsTo } from "../storage-key";

const COMPANY = "10000000-0000-4000-8000-000000000001";
const RECORD = "20000000-0000-4000-8000-000000000002";

describe("mintStorageKey", () => {
  it("lays keys out as company/scope/record/uuid.ext and never uses the user's file name", () => {
    const key = mintStorageKey({ companyId: COMPANY, scope: "recordFile", recordId: RECORD, extension: "pdf" });

    expect(key).toMatch(new RegExp(`^${COMPANY}/recordFile/${RECORD}/[0-9a-f-]{36}\\.pdf$`));
  });

  it("mints a fresh object id every time", () => {
    const args = { companyId: COMPANY, scope: "document" as const, recordId: RECORD, extension: null };

    expect(mintStorageKey(args)).not.toBe(mintStorageKey(args));
    expect(mintStorageKey(args)).not.toContain(".");
  });

  it("files an object without a record under unlinked", () => {
    expect(mintStorageKey({ companyId: COMPANY, scope: "mailAttachment", recordId: null, extension: "eml" })).toMatch(
      new RegExp(`^${COMPANY}/mailAttachment/unlinked/`),
    );
  });

  it.each([
    ["a company id with a slash", { companyId: `${COMPANY}/..` }],
    ["a record id with a dot", { recordId: "../other" }],
    ["an extension with a dot", { extension: "tar.gz" }],
    ["an upper-case extension", { extension: "PDF" }],
  ])("refuses %s", (_label, override) => {
    expect(() =>
      mintStorageKey({ companyId: COMPANY, scope: "recordFile", recordId: RECORD, extension: "pdf", ...override }),
    ).toThrow();
  });
});

describe("storageKeyBelongsTo", () => {
  it("accepts only keys inside the company's own prefix", () => {
    const key = mintStorageKey({ companyId: COMPANY, scope: "invoice", recordId: RECORD, extension: "pdf" });

    expect(storageKeyBelongsTo(key, COMPANY)).toBe(true);
    expect(storageKeyBelongsTo(key, "30000000-0000-4000-8000-000000000003")).toBe(false);
    expect(storageKeyBelongsTo(`${COMPANY}/../other/x`, COMPANY)).toBe(false);
  });
});
