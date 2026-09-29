import type { RecordDocumentStatus } from "@/generated/prisma";
import type { RecordDocumentEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto, RecordDocumentFileDto } from "../record-document.schema";

export interface CreateRecordDocumentRepo {
  isRecordAccessible(entityType: RecordDocumentEntityType, recordId: string): Promise<boolean>;
  createDocumentWithPendingOriginal(args: {
    entityType: RecordDocumentEntityType;
    recordId: string;
    title: string;
    status: RecordDocumentStatus;
    storageKey: string;
    fileName: string;
    byteSize: number;
  }): Promise<{ document: RecordDocumentDto; file: RecordDocumentFileDto }>;
}
