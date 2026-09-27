import type { RecordFileEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto } from "../record-document.schema";

export interface GetRecordDocumentsRepo {
  isRecordAccessible(entityType: RecordFileEntityType, recordId: string): Promise<boolean>;
  listDocuments(entityType: RecordFileEntityType, recordId: string): Promise<RecordDocumentDto[]>;
}
