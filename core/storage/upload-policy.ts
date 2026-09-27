import type { ContentDisposition, StoredObjectStat } from "./storage-provider";

export const UploadPolicyName = {
  recordFile: "recordFile",
  document: "document",
  mailAttachment: "mailAttachment",
} as const;

export type UploadPolicyName = (typeof UploadPolicyName)[keyof typeof UploadPolicyName];

export const UploadRefusal = {
  empty: "empty",
  tooLarge: "tooLarge",
  extensionMissing: "extensionMissing",
  typeNotAllowed: "typeNotAllowed",
  typeMismatch: "typeMismatch",
} as const;

export type UploadRefusal = (typeof UploadRefusal)[keyof typeof UploadRefusal];

export type UploadCheck =
  | { ok: true; extension: string | null; contentType: string; disposition: ContentDisposition }
  | { ok: false; reason: UploadRefusal };

const SPREADSHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SLIDES = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const CONTENT_TYPES_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  heic: ["image/heic"],
  txt: ["text/plain"],
  csv: ["text/csv", "text/plain", "application/vnd.ms-excel"],
  md: ["text/markdown", "text/plain"],
  rtf: ["application/rtf", "text/rtf"],
  doc: ["application/msword"],
  docx: [WORD],
  xls: ["application/vnd.ms-excel"],
  xlsx: [SPREADSHEET],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: [SLIDES],
  odt: ["application/vnd.oasis.opendocument.text"],
  ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  odp: ["application/vnd.oasis.opendocument.presentation"],
  zip: ["application/zip", "application/x-zip-compressed"],
  eml: ["message/rfc822"],
  ics: ["text/calendar"],
  vcf: ["text/vcard", "text/x-vcard"],
  mp3: ["audio/mpeg"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  wav: ["audio/wav", "audio/x-wav"],
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
};

const INLINE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const ACTIVE_CONTENT =
  /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|application\/xml|text\/xml|application\/javascript|text\/javascript|application\/x-[a-z0-9.+-]+)$|\+xml$/;

const EXTENSION_OF = /\.([a-z0-9]{1,10})$/;
const OCTET_STREAM = "application/octet-stream";

export function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function fileExtensionOf(fileName: string): string | null {
  const match = EXTENSION_OF.exec(fileName.trim().toLowerCase());
  return match ? match[1] : null;
}

export function isActiveContent(contentType: string): boolean {
  return ACTIVE_CONTENT.test(normalizeContentType(contentType));
}

export function dispositionFor(contentType: string): ContentDisposition {
  return INLINE_CONTENT_TYPES.has(normalizeContentType(contentType)) ? "inline" : "attachment";
}

export function uploadedObjectMatches(
  stat: StoredObjectStat,
  expected: { byteSize: number; contentType: string },
): boolean {
  return (
    stat.byteSize === expected.byteSize &&
    (stat.contentType === null || normalizeContentType(stat.contentType) === expected.contentType)
  );
}

export function servedContentTypeFor(contentType: string): string {
  const normalized = normalizeContentType(contentType);
  return normalized === "" || isActiveContent(normalized) ? OCTET_STREAM : normalized;
}

export function checkUpload(args: {
  fileName: string;
  contentType: string;
  byteSize: number;
  maxBytes: number;
  policy: UploadPolicyName;
}): UploadCheck {
  if (!Number.isInteger(args.byteSize) || args.byteSize <= 0) return { ok: false, reason: UploadRefusal.empty };
  if (args.byteSize > args.maxBytes) return { ok: false, reason: UploadRefusal.tooLarge };

  const extension = fileExtensionOf(args.fileName);
  const contentType = normalizeContentType(args.contentType);

  if (args.policy === UploadPolicyName.mailAttachment) {
    const stored = contentType === "" ? OCTET_STREAM : contentType;
    return {
      ok: true,
      extension,
      contentType: stored,
      disposition: isActiveContent(stored) ? "attachment" : dispositionFor(stored),
    };
  }

  if (!extension) return { ok: false, reason: UploadRefusal.extensionMissing };
  if (args.policy === UploadPolicyName.document && extension !== "pdf")
    return { ok: false, reason: UploadRefusal.typeNotAllowed };

  const accepted = CONTENT_TYPES_BY_EXTENSION[extension];
  if (!accepted) return { ok: false, reason: UploadRefusal.typeNotAllowed };

  if (accepted.includes(contentType)) {
    const canonical = accepted[0];
    return { ok: true, extension, contentType: canonical, disposition: dispositionFor(canonical) };
  }

  return {
    ok: false,
    reason: isActiveContent(contentType) ? UploadRefusal.typeNotAllowed : UploadRefusal.typeMismatch,
  };
}

function asciiFallback(fileName: string): string {
  const cleaned = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "")
    .trim();
  return cleaned === "" ? "download" : cleaned;
}

export function contentDisposition(disposition: ContentDisposition, fileName: string): string {
  const name = fileName.replace(/[\r\n]/g, " ").trim() || "download";
  return `${disposition}; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
