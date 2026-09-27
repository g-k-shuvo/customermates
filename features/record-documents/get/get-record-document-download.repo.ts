export type StoredDocumentPdf = { storageKey: string; fileName: string };

export type StoredDocumentPdfs = { original: StoredDocumentPdf; signed: StoredDocumentPdf | null };

export interface GetRecordDocumentDownloadRepo {
  findListedDocumentPdfsOrNull(id: string): Promise<StoredDocumentPdfs | null>;
}
