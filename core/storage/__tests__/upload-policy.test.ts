import { describe, expect, it } from "vitest";

import {
  checkUpload,
  contentDisposition,
  dispositionFor,
  fileExtensionOf,
  servedContentTypeFor,
  UploadPolicyName,
  UploadRefusal,
} from "../upload-policy";

const MAX = 10 * 1024 * 1024;

function record(fileName: string, contentType: string, byteSize = 1024) {
  return checkUpload({ fileName, contentType, byteSize, maxBytes: MAX, policy: UploadPolicyName.recordFile });
}

describe("record file uploads", () => {
  it("accepts a known type whose extension and content type agree, and shows PDFs and images inline", () => {
    expect(record("Offer 2026.PDF", "application/pdf")).toEqual({
      ok: true,
      extension: "pdf",
      contentType: "application/pdf",
      disposition: "inline",
    });
    expect(record("sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toMatchObject({
      ok: true,
      disposition: "attachment",
    });
  });

  it("stores the canonical type for a known alias, such as Windows' zip type", () => {
    expect(record("archive.zip", "application/x-zip-compressed")).toMatchObject({
      ok: true,
      contentType: "application/zip",
    });
    expect(record("notes.txt", "text/plain; charset=utf-8")).toMatchObject({ ok: true, contentType: "text/plain" });
  });

  it.each([
    ["an HTML page", "page.html", "text/html"],
    ["an SVG", "logo.svg", "image/svg+xml"],
    ["an XML document", "feed.xml", "application/xml"],
    ["an executable", "setup.exe", "application/x-msdownload"],
    ["a script", "run.sh", "application/x-sh"],
  ])("refuses %s outright", (_label, fileName, contentType) => {
    expect(record(fileName, contentType)).toEqual({ ok: false, reason: UploadRefusal.typeNotAllowed });
  });

  it("refuses active content disguised behind an allowed extension", () => {
    expect(record("invoice.pdf", "text/html")).toEqual({ ok: false, reason: UploadRefusal.typeNotAllowed });
  });

  it("refuses an extension and content type that disagree", () => {
    expect(record("photo.png", "application/pdf")).toEqual({ ok: false, reason: UploadRefusal.typeMismatch });
  });

  it("refuses a name without an extension, an empty file and one over the limit", () => {
    expect(record("README", "text/plain")).toEqual({ ok: false, reason: UploadRefusal.extensionMissing });
    expect(record("a.pdf", "application/pdf", 0)).toEqual({ ok: false, reason: UploadRefusal.empty });
    expect(record("a.pdf", "application/pdf", MAX + 1)).toEqual({ ok: false, reason: UploadRefusal.tooLarge });
  });
});

describe("document uploads", () => {
  const document = (fileName: string, contentType: string) =>
    checkUpload({ fileName, contentType, byteSize: 512, maxBytes: MAX, policy: UploadPolicyName.document });

  it("takes a PDF and nothing else, even a type the file allowlist accepts", () => {
    expect(document("NDA Müller.PDF", "application/pdf")).toEqual({
      ok: true,
      extension: "pdf",
      contentType: "application/pdf",
      disposition: "inline",
    });
    expect(
      document("contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toEqual({ ok: false, reason: UploadRefusal.typeNotAllowed });
    expect(document("scan.png", "image/png")).toEqual({ ok: false, reason: UploadRefusal.typeNotAllowed });
    expect(document("contract.pdf", "text/html")).toEqual({ ok: false, reason: UploadRefusal.typeNotAllowed });
    expect(document("contract.pdf", "image/png")).toEqual({ ok: false, reason: UploadRefusal.typeMismatch });
    expect(document("contract", "application/pdf")).toEqual({ ok: false, reason: UploadRefusal.extensionMissing });
  });
});

describe("mail attachment uploads", () => {
  it("keeps what real mail carries, HTML included, but never lets it render", () => {
    expect(
      checkUpload({
        fileName: "newsletter.html",
        contentType: "text/html",
        byteSize: 2048,
        maxBytes: MAX,
        policy: UploadPolicyName.mailAttachment,
      }),
    ).toEqual({ ok: true, extension: "html", contentType: "text/html", disposition: "attachment" });
  });

  it("still enforces the size limit", () => {
    expect(
      checkUpload({
        fileName: "big.bin",
        contentType: "",
        byteSize: MAX + 1,
        maxBytes: MAX,
        policy: UploadPolicyName.mailAttachment,
      }),
    ).toEqual({ ok: false, reason: UploadRefusal.tooLarge });
  });
});

describe("serving stored files", () => {
  it("serves active content as a plain download", () => {
    expect(servedContentTypeFor("text/html")).toBe("application/octet-stream");
    expect(servedContentTypeFor("image/svg+xml")).toBe("application/octet-stream");
    expect(servedContentTypeFor("application/pdf")).toBe("application/pdf");
    expect(dispositionFor("image/png")).toBe("inline");
    expect(dispositionFor("text/plain")).toBe("attachment");
  });

  it("encodes the file name safely for Content-Disposition", () => {
    expect(contentDisposition("attachment", 'Angebot "Müller" 2026.pdf')).toBe(
      "attachment; filename=\"Angebot Muller 2026.pdf\"; filename*=UTF-8''Angebot%20%22M%C3%BCller%22%202026.pdf",
    );
    expect(contentDisposition("inline", "\r\n")).toBe("inline; filename=\"download\"; filename*=UTF-8''download");
  });

  it("reads the extension case-insensitively and only from the end of the name", () => {
    expect(fileExtensionOf("Report.Final.DOCX")).toBe("docx");
    expect(fileExtensionOf("archive.")).toBeNull();
  });
});
