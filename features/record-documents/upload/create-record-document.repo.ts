import type { RecordDocumentStatus } from "@/generated/prisma";
import type { RecordFileEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto, RecordDocumentFileDto } from "../record-document.schema";

export interface CreateRecordDocumentRepo {
  isRecordAccessible(entityType: RecordFileEntityType, recordId: string): Promise<boolean>;
  createDocumentWithPendingOriginal(args: {
    entityType: RecordFileEntityType;
    recordId: string;
    title: string;
    status: RecordDocumentStatus;
    storageKey: string;
    fileName: string;
    byteSize: number;
  }): Promise<{ document: RecordDocumentDto; file: RecordDocumentFileDto }>;
}
