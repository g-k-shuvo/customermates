import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { SweepRecordFilesResult } from "../record-file.schema";
import type { SweepRecordFilesRepo } from "./sweep-record-files.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export const RECORD_FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
export const RECORD_FILE_SWEEP_LIMIT = 200;

@SystemInteractor
export class SweepRecordFilesInteractor {
  constructor(
    private repo: SweepRecordFilesRepo,
    private storage: StorageProvider,
    private now: () => Date = () => new Date(),
  ) {}

  async invoke(): Validated<SweepRecordFilesResult> {
    const candidates = await this.repo.findSweepableFilesUnscoped({
      pendingBefore: new Date(this.now().getTime() - RECORD_FILE_PENDING_TTL_MS),
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

    return { ok: true as const, data: { removed: await this.repo.deleteFilesUnscoped(removable) } };
  }
}
