import type { RecordDocumentDto, RecordDocumentFileDto } from "../record-document.schema";

export interface CreateSignedCopyUploadRepo {
  findListedDocumentOrNull(id: string): Promise<RecordDocumentDto | null>;
  createPendingSignedFile(args: {
    documentId: string;
    storageKey: string;
    fileName: string;
    byteSize: number;
  }): Promise<RecordDocumentFileDto>;
}
