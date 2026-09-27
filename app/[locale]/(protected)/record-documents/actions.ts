"use server";

import type { RecordFileTargetData } from "@/features/record-files/record-file.schema";
import type {
  RecordDocumentFileIdData,
  RecordDocumentIdData,
} from "@/features/record-documents/record-document.schema";
import type { CreateRecordDocumentData } from "@/features/record-documents/upload/create-record-document.interactor";
import type { CreateSignedCopyUploadData } from "@/features/record-documents/upload/create-signed-copy-upload.interactor";
import type { GetRecordDocumentDownloadData } from "@/features/record-documents/get/get-record-document-download.interactor";
import type { UpdateRecordDocumentData } from "@/features/record-documents/update/update-record-document.interactor";
import type {
  SendForSignatureData,
  VoidSignatureData,
} from "@/features/record-documents/signing/record-document-signing.schema";

import {
  getCompleteRecordDocumentFileInteractor,
  getCreateRecordDocumentInteractor,
  getCreateSignedCopyUploadInteractor,
  getDeleteRecordDocumentInteractor,
  getGetRecordDocumentDownloadInteractor,
  getGetRecordDocumentsInteractor,
  getUpdateRecordDocumentInteractor,
  getGetSignatureSuggestionsInteractor,
  getRefreshSignatureInteractor,
  getSendForSignatureInteractor,
  getVoidSignatureInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getRecordDocumentsAction(data: RecordFileTargetData) {
  return serializeResult(getGetRecordDocumentsInteractor().invoke(data));
}

export async function createRecordDocumentAction(data: CreateRecordDocumentData) {
  return serializeResult(getCreateRecordDocumentInteractor().invoke(data));
}

export async function createSignedCopyUploadAction(data: CreateSignedCopyUploadData) {
  return serializeResult(getCreateSignedCopyUploadInteractor().invoke(data));
}

export async function completeRecordDocumentFileAction(data: RecordDocumentFileIdData) {
  return serializeResult(getCompleteRecordDocumentFileInteractor().invoke(data));
}

export async function updateRecordDocumentAction(data: UpdateRecordDocumentData) {
  return serializeResult(getUpdateRecordDocumentInteractor().invoke(data));
}

export async function getRecordDocumentDownloadAction(data: GetRecordDocumentDownloadData) {
  return serializeResult(getGetRecordDocumentDownloadInteractor().invoke(data));
}

export async function deleteRecordDocumentAction(data: RecordDocumentIdData) {
  return serializeResult(getDeleteRecordDocumentInteractor().invoke(data));
}

export async function getSignatureSuggestionsAction(data: RecordFileTargetData) {
  return serializeResult(getGetSignatureSuggestionsInteractor().invoke(data));
}

export async function sendForSignatureAction(data: SendForSignatureData) {
  return serializeResult(getSendForSignatureInteractor().invoke(data));
}

export async function voidSignatureAction(data: VoidSignatureData) {
  return serializeResult(getVoidSignatureInteractor().invoke(data));
}

export async function refreshSignatureAction(data: RecordDocumentIdData) {
  return serializeResult(getRefreshSignatureInteractor().invoke(data));
}
