import type { CampaignRetentionRepo } from "./campaign-retention.repo";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export const REDACTED_ADDRESS = "";

export class PrismaCampaignRetentionRepo extends BaseRepository implements CampaignRetentionRepo {
  @BypassTenantGuard
  async redactRecipientsFinishedBeforeUnscoped(before: Date, limit: number): Promise<number> {
    const rows = await this.prisma.campaignRecipient.findMany({
      where: { email: { not: REDACTED_ADDRESS }, campaign: { finishedAt: { lt: before } } },
      take: limit,
      select: { id: true, companyId: true, campaignId: true, email: true },
    });
    if (rows.length === 0) return 0;

    await this.prisma.messageDelivery.updateMany({
      where: {
        campaignId: { in: [...new Set(rows.map((row) => row.campaignId))] },
        recipient: { in: [...new Set(rows.map((row) => row.email.trim().toLowerCase()))] },
      },
      data: { recipient: REDACTED_ADDRESS, contactId: null },
    });
    const { count } = await this.prisma.campaignRecipient.updateMany({
      where: {
        id: { in: rows.map((row) => row.id) },
        companyId: { in: [...new Set(rows.map((row) => row.companyId))] },
      },
      data: { email: REDACTED_ADDRESS, error: null },
    });

    return count;
  }
}
