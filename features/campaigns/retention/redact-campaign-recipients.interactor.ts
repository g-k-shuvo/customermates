import type { CampaignRetentionRepo } from "./campaign-retention.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export const CAMPAIGN_RECIPIENT_RETENTION_DAYS = 180;
export const CAMPAIGN_REDACTION_LIMIT = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

@SystemInteractor
export class RedactCampaignRecipientsInteractor {
  constructor(private repo: CampaignRetentionRepo) {}

  async invoke(now: Date = new Date()): Validated<{ redacted: number }> {
    const before = new Date(now.getTime() - CAMPAIGN_RECIPIENT_RETENTION_DAYS * DAY_MS);

    return {
      ok: true as const,
      data: { redacted: await this.repo.redactRecipientsFinishedBeforeUnscoped(before, CAMPAIGN_REDACTION_LIMIT) },
    };
  }
}
