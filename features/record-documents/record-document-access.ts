import type { UploadCheck } from "@/core/storage/upload-policy";

import { RECORD_DOCUMENT_TITLE_MAX_LENGTH } from "./record-document.schema";

import { checkUpload, UploadPolicyName, UploadRefusal } from "@/core/storage/upload-policy";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function checkDocumentPdf(args: { fileName: string; contentType: string; byteSize: number; maxBytes: number }) {
  return checkUpload({ ...args, policy: UploadPolicyName.document });
}

export function documentPdfRefusal(check: Extract<UploadCheck, { ok: false }>) {
  if (check.reason === UploadRefusal.tooLarge) return fail(CustomErrorCode.fileTooLarge, ["byteSize"]);
  if (check.reason === UploadRefusal.empty) return fail(CustomErrorCode.fileEmpty, ["byteSize"]);

  return fail(CustomErrorCode.documentNotPdf, ["fileName"]);
}

export function titleFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.pdf$/i, "").trim();

  return (withoutExtension === "" ? trimmed : withoutExtension).slice(0, RECORD_DOCUMENT_TITLE_MAX_LENGTH);
}
