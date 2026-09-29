import type { BulkJobHandler, BulkJobPage } from "@/features/bulk-job/bulk-job-handler";
import type { RunningBulkJob } from "@/features/bulk-job/bulk-job.repo";
import type { AudienceRepo } from "@/features/audience/audience.repo";
import type { CampaignRepo } from "../campaign.repo";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { z } from "zod";

import { BulkJobKind, CampaignStatus } from "@/generated/prisma";

import { AudienceDefinitionSchema } from "@/features/audience/audience.schema";

import { BaseRepository } from "@/core/base/base-repository";

export const CampaignSendDefinitionSchema = z.object({ campaignId: z.uuid(), audience: AudienceDefinitionSchema });

export class PrismaCampaignSendRepo extends BaseRepository implements BulkJobHandler {
  readonly kind = BulkJobKind.campaignSend;

  constructor(
    private audiences: AudienceRepo,
    private campaigns: CampaignRepo,
    private backgroundTasks: BackgroundTaskService,
  ) {
    super();
  }

  async countTotal(job: RunningBulkJob): Promise<number> {
    const definition = CampaignSendDefinitionSchema.parse(job.definition);

    return (await this.audiences.countAudience(definition.audience)).count;
  }

  async processPage(job: RunningBulkJob, cursor: string | null, take: number): Promise<BulkJobPage> {
    const definition = CampaignSendDefinitionSchema.parse(job.definition);
    const recipients = await this.audiences.findRecipientsPage(definition.audience, cursor, take);
    await this.campaigns.addRecipients(definition.campaignId, recipients);

    return {
      processed: recipients.length,
      nextCursor: recipients.length === take ? recipients[recipients.length - 1].contactId : null,
    };
  }

  async finish(job: RunningBulkJob): Promise<void> {
    const definition = CampaignSendDefinitionSchema.parse(job.definition);

    await this.backgroundTasks.dispatch("send-campaign", { campaignId: definition.campaignId });
  }

  async fail(job: RunningBulkJob): Promise<void> {
    const definition = CampaignSendDefinitionSchema.parse(job.definition);

    await this.campaigns.moveStatus(definition.campaignId, [CampaignStatus.sending], CampaignStatus.failed);
  }
}
