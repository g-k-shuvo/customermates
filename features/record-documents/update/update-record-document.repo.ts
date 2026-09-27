import type { RecordDocumentStatus } from "@/generated/prisma";
import type { RecordDocumentDto } from "../record-document.schema";

export interface UpdateRecordDocumentRepo {
  findListedDocumentOrNull(id: string): Promise<RecordDocumentDto | null>;
  updateDocumentOrNull(
    id: string,
    changes: { title?: string; status?: RecordDocumentStatus },
  ): Promise<RecordDocumentDto | null>;
}
