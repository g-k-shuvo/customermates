import type { RecordDocumentEntityType } from "@/features/record-files/record-file.schema";

export type DeletableRecordDocument = {
  id: string;
  entityType: RecordDocumentEntityType;
  title: string;
  storageKeys: string[];
};

export interface DeleteRecordDocumentRepo {
  findDocumentOrNull(id: string): Promise<DeletableRecordDocument | null>;
  deleteDocument(id: string): Promise<boolean>;
}
