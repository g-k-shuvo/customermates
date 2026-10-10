import { type StorageProvider, StorageError, StorageFailure } from "./storage-provider";

export const CONTENT_SIGNATURE_BYTES = 16;
export const OBJECT_HEAD_READ_TIMEOUT_MS = 30_000;

const EXECUTABLE_SIGNATURES: readonly (readonly number[])[] = [
  [0x4d, 0x5a],
  [0x7f, 0x45, 0x4c, 0x46],
  [0xca, 0xfe, 0xba, 0xbe],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0x23, 0x21],
];

const ZIP = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
] as const;
const OLE = [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]] as const;
const ISO_MEDIA = "ftyp";

const SIGNATURES_BY_CONTENT_TYPE: Readonly<Record<string, readonly (readonly number[])[] | "isoMedia" | "text">> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  "image/heic": "isoMedia",
  "application/rtf": [[0x7b, 0x5c, 0x72, 0x74, 0x66]],
  "application/msword": OLE,
  "application/vnd.ms-excel": OLE,
  "application/vnd.ms-powerpoint": OLE,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ZIP,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ZIP,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ZIP,
  "application/vnd.oasis.opendocument.text": ZIP,
  "application/vnd.oasis.opendocument.spreadsheet": ZIP,
  "application/vnd.oasis.opendocument.presentation": ZIP,
  "application/zip": ZIP,
  "audio/mpeg": [
    [0x49, 0x44, 0x33],
    [0xff, 0xfb],
    [0xff, 0xf3],
    [0xff, 0xf2],
  ],
  "audio/mp4": "isoMedia",
  "audio/wav": [[0x52, 0x49, 0x46, 0x46]],
  "video/mp4": "isoMedia",
  "video/quicktime": "isoMedia",
  "text/plain": "text",
  "text/csv": "text",
  "text/markdown": "text",
  "text/calendar": "text",
  "text/vcard": "text",
  "message/rfc822": "text",
};

function startsWith(head: Uint8Array, signature: readonly number[]): boolean {
  return signature.length <= head.length && signature.every((byte, index) => head[index] === byte);
}

function isIsoMedia(head: Uint8Array): boolean {
  return String.fromCharCode(...head.subarray(4, 8)) === ISO_MEDIA;
}

export function contentMatchesType(contentType: string, head: Uint8Array): boolean {
  if (EXECUTABLE_SIGNATURES.some((signature) => startsWith(head, signature))) return false;

  const expected = SIGNATURES_BY_CONTENT_TYPE[contentType];
  if (!expected) return true;
  if (expected === "isoMedia") return isIsoMedia(head);
  if (expected === "text") return !head.includes(0);

  return expected.some((signature) => startsWith(head, signature));
}

export async function readObjectHead(
  storage: StorageProvider,
  key: string,
  timeoutMs: number = OBJECT_HEAD_READ_TIMEOUT_MS,
): Promise<Uint8Array> {
  const { body } = await storage.getObject(key);
  const reader = body.getReader();
  const head = new Uint8Array(CONTENT_SIGNATURE_BYTES);
  let filled = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StorageError(StorageFailure.unavailable, "object read timed out")), timeoutMs);
  });

  try {
    while (filled < CONTENT_SIGNATURE_BYTES) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done || !value) break;
      const take = Math.min(value.length, CONTENT_SIGNATURE_BYTES - filled);
      head.set(value.subarray(0, take), filled);
      filled += take;
    }
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => undefined);
  }

  return head.subarray(0, filled);
}
