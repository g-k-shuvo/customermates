import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { SweepRecordDocumentsResult } from "../record-document.schema";
import type { SweepRecordDocumentsRepo } from "./sweep-record-documents.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import {
  RECORD_FILE_PENDING_TTL_MS,
  RECORD_FILE_SWEEP_LIMIT,
} from "@/features/record-files/sweep/sweep-record-files.interactor";

@SystemInteractor
export class SweepRecordDocumentsInteractor {
  constructor(
    private repo: SweepRecordDocumentsRepo,
    private storage: StorageProvider,
    private now: () => Date = () => new Date(),
  ) {}

  async invoke(): Validated<SweepRecordDocumentsResult> {
    const cutoff = new Date(this.now().getTime() - RECORD_FILE_PENDING_TTL_MS);
    const candidates = await this.repo.findSweepableDocumentFilesUnscoped({
      pendingBefore: cutoff,
      limit: RECORD_FILE_SWEEP_LIMIT,
    });

    const removable: string[] = [];
    for (const file of candidates) {
      if (this.storage.configured) {
        const deleted = await this.storage.deleteObject(file.storageKey).then(
          () => true,
          () => false,
        );
        if (!deleted) continue;
      }

      removable.push(file.id);
    }

    const removedFiles = await this.repo.deleteDocumentFilesUnscoped(removable);
    const removedDocuments = await this.repo.deleteEmptyDocumentsUnscoped({
      createdBefore: cutoff,
      limit: RECORD_FILE_SWEEP_LIMIT,
    });

    return { ok: true as const, data: { removedFiles, removedDocuments } };
  }
}
