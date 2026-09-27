import type { RecordFileDto, RecordFileEntityType } from "../record-file.schema";

export type PendingRecordFile = {
  id: string;
  entityType: RecordFileEntityType;
  recordId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
};

export abstract class CompleteRecordFileUploadRepo {
  abstract findPendingFileOrNull(id: string): Promise<PendingRecordFile | null>;
  abstract markFileReadyOrNull(id: string): Promise<RecordFileDto | null>;
  abstract deletePendingFile(id: string): Promise<void>;
}
