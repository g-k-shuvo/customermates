import type { RecordDocumentEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto } from "../record-document.schema";

export interface GetRecordDocumentsRepo {
  isRecordAccessible(entityType: RecordDocumentEntityType, recordId: string): Promise<boolean>;
  listDocuments(entityType: RecordDocumentEntityType, recordId: string): Promise<RecordDocumentDto[]>;
}
