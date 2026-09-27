import type { RecordFileDto, RecordFileEntityType } from "../record-file.schema";

export abstract class CreateRecordFileUploadRepo {
  abstract isRecordAccessible(entityType: RecordFileEntityType, recordId: string): Promise<boolean>;
  abstract createPendingFile(args: {
    entityType: RecordFileEntityType;
    recordId: string;
    storageKey: string;
    fileName: string;
    contentType: string;
    byteSize: number;
  }): Promise<RecordFileDto>;
}
