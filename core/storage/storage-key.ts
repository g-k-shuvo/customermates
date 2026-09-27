import { randomUUID } from "node:crypto";

export const STORAGE_SCOPES = ["recordFile", "document", "invoice", "mailAttachment"] as const;

export type StorageScope = (typeof STORAGE_SCOPES)[number];

export const UNLINKED_RECORD_SEGMENT = "unlinked";

const IDENTIFIER = /^[A-Za-z0-9-]{1,64}$/;
const EXTENSION = /^[a-z0-9]{1,10}$/;

export function mintStorageKey(args: {
  companyId: string;
  scope: StorageScope;
  recordId: string | null;
  extension: string | null;
}): string {
  if (!IDENTIFIER.test(args.companyId)) throw new Error("companyId cannot be part of a storage key");
  if (args.recordId !== null && !IDENTIFIER.test(args.recordId))
    throw new Error("recordId cannot be part of a storage key");
  if (args.extension !== null && !EXTENSION.test(args.extension))
    throw new Error("extension cannot be part of a storage key");

  const suffix = args.extension ? `.${args.extension}` : "";

  return `${args.companyId}/${args.scope}/${args.recordId ?? UNLINKED_RECORD_SEGMENT}/${randomUUID()}${suffix}`;
}

export function storageKeyBelongsTo(key: string, companyId: string): boolean {
  return IDENTIFIER.test(companyId) && key.startsWith(`${companyId}/`) && !key.includes("..");
}
