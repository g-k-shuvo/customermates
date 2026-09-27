"use server";

import type { RecordFileIdData, RecordFileTargetData } from "@/features/record-files/record-file.schema";
import type { CreateRecordFileUploadData } from "@/features/record-files/upload/create-record-file-upload.interactor";

import {
  getCompleteRecordFileUploadInteractor,
  getCreateRecordFileUploadInteractor,
  getDeleteRecordFileInteractor,
  getGetRecordFileDownloadInteractor,
  getGetRecordFilesInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getRecordFilesAction(data: RecordFileTargetData) {
  return serializeResult(getGetRecordFilesInteractor().invoke(data));
}

export async function createRecordFileUploadAction(data: CreateRecordFileUploadData) {
  return serializeResult(getCreateRecordFileUploadInteractor().invoke(data));
}

export async function completeRecordFileUploadAction(data: RecordFileIdData) {
  return serializeResult(getCompleteRecordFileUploadInteractor().invoke(data));
}

export async function getRecordFileDownloadAction(data: RecordFileIdData) {
  return serializeResult(getGetRecordFileDownloadInteractor().invoke(data));
}

export async function deleteRecordFileAction(data: RecordFileIdData) {
  return serializeResult(getDeleteRecordFileInteractor().invoke(data));
}
