import type { StoredRecordFile } from "../get/get-record-file-download.repo";

export abstract class DeleteRecordFileRepo {
  abstract findFileOrNull(id: string): Promise<StoredRecordFile | null>;
  abstract deleteFile(id: string): Promise<boolean>;
}
