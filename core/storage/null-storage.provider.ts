import type { StorageProvider } from "./storage-provider";

import { StorageError, StorageFailure } from "./storage-provider";

function notConfigured(): Promise<never> {
  return Promise.reject(new StorageError(StorageFailure.notConfigured));
}

export const nullStorageProvider: StorageProvider = {
  configured: false,
  maxUploadBytes: 0,
  presignUpload: notConfigured,
  presignDownload: notConfigured,
  statObject: notConfigured,
  getObject: notConfigured,
  putObject: notConfigured,
  deleteObject: notConfigured,
};
