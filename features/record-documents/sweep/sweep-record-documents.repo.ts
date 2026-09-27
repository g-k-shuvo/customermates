export type SweepableRecordDocumentFile = { id: string; storageKey: string };

export interface SweepRecordDocumentsRepo {
  findSweepableDocumentFilesUnscoped(args: {
    pendingBefore: Date;
    limit: number;
  }): Promise<SweepableRecordDocumentFile[]>;
  deleteDocumentFilesUnscoped(ids: readonly string[]): Promise<number>;
  deleteEmptyDocumentsUnscoped(args: { createdBefore: Date; limit: number }): Promise<number>;
}
