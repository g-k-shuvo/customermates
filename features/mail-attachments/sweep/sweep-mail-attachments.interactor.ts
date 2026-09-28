import type { Validated } from "@/core/validation/validation.utils";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { SweepMailAttachmentsRepo } from "../mail-attachment.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export const MAIL_ATTACHMENT_SWEEP_LIMIT = 200;

@SystemInteractor
export class SweepMailAttachmentsInteractor {
  constructor(
    private repo: SweepMailAttachmentsRepo,
    private storage: StorageProvider,
  ) {}

  async invoke(): Validated<{ removed: number }> {
    const orphans = await this.repo.findOrphanedAttachmentsUnscoped(MAIL_ATTACHMENT_SWEEP_LIMIT);

    const removable: string[] = [];
    for (const attachment of orphans) {
      if (attachment.storageKey && this.storage.configured) {
        const key = attachment.storageKey;
        const deleted = await this.storage.deleteObject(key).then(
          () => true,
          () => false,
        );
        if (!deleted) continue;
      }

      removable.push(attachment.id);
    }

    return { ok: true as const, data: { removed: await this.repo.deleteAttachmentsUnscoped(removable) } };
  }
}
