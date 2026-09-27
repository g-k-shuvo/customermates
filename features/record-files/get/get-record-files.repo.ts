import type { RecordFileDto, RecordFileEntityType } from "../record-file.schema";

export abstract class GetRecordFilesRepo {
  abstract isRecordAccessible(entityType: RecordFileEntityType, recordId: string): Promise<boolean>;
  abstract listReadyFiles(entityType: RecordFileEntityType, recordId: string): Promise<RecordFileDto[]>;
}
