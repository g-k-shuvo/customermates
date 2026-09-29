import type { RecordDocumentFileKind } from "@/generated/prisma";
import type { RecordDocumentEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto } from "../record-document.schema";

export type PendingRecordDocumentFile = {
  id: string;
  documentId: string;
  entityType: RecordDocumentEntityType;
  kind: RecordDocumentFileKind;
  storageKey: string;
  byteSize: number;
};

export type SupersededRecordDocumentFile = { id: string; storageKey: string };

export interface CompleteRecordDocumentFileRepo {
  findPendingFileOrNull(documentId: string, fileId: string): Promise<PendingRecordDocumentFile | null>;
  findSupersededSignedFiles(documentId: string, fileId: string): Promise<SupersededRecordDocumentFile[]>;
  discardPendingFile(file: PendingRecordDocumentFile): Promise<void>;
  markFileReadyOrNull(
    file: PendingRecordDocumentFile,
    superseded: readonly SupersededRecordDocumentFile[],
  ): Promise<RecordDocumentDto | null>;
}
