import type { UploadRefusal } from "@/core/storage/upload-policy";
import type { RecordFileEntityType } from "./record-file.schema";

import { Action, Resource } from "@/generated/prisma";

import { StorageError, StorageFailure } from "@/core/storage/storage-provider";
import { failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const RECORD_FILE_RESOURCE: Record<RecordFileEntityType, Resource> = {
  contact: Resource.contacts,
  organization: Resource.organizations,
  deal: Resource.deals,
};

export const RECORD_NOT_FOUND_CODE: Record<RecordFileEntityType, CustomErrorCode> = {
  contact: CustomErrorCode.contactNotFound,
  organization: CustomErrorCode.organizationNotFound,
  deal: CustomErrorCode.dealNotFound,
};

export const UPLOAD_REFUSAL_CODE: Record<UploadRefusal, CustomErrorCode> = {
  empty: CustomErrorCode.fileEmpty,
  tooLarge: CustomErrorCode.fileTooLarge,
  extensionMissing: CustomErrorCode.fileExtensionMissing,
  typeNotAllowed: CustomErrorCode.fileTypeNotAllowed,
  typeMismatch: CustomErrorCode.fileTypeMismatch,
};

export const UPLOAD_REFUSAL_PATH: Record<UploadRefusal, string> = {
  empty: "byteSize",
  tooLarge: "byteSize",
  extensionMissing: "fileName",
  typeNotAllowed: "contentType",
  typeMismatch: "contentType",
};

const recordResources = [Resource.contacts, Resource.organizations, Resource.deals];

export const RECORD_FILE_READ_PERMISSIONS = recordResources.flatMap((resource) => [
  { resource, action: Action.readAll },
  { resource, action: Action.readOwn },
]);

export const RECORD_FILE_WRITE_PERMISSIONS = recordResources.map((resource) => ({ resource, action: Action.update }));

export function storageFailure(error: unknown) {
  if (!(error instanceof StorageError)) throw error;

  return failUnavailable(
    error.failure === StorageFailure.notConfigured
      ? CustomErrorCode.fileStorageNotConfigured
      : CustomErrorCode.fileStorageUnavailable,
  );
}
