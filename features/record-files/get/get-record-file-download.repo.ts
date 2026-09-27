import type { RecordFileEntityType } from "../record-file.schema";

export type StoredRecordFile = {
  id: string;
  entityType: RecordFileEntityType;
  recordId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
};

export abstract class GetRecordFileDownloadRepo {
  abstract findReadyFileOrNull(id: string): Promise<StoredRecordFile | null>;
}
