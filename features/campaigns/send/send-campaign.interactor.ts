import type { CampaignRepo } from "../campaign.repo";
import type { AudienceRepo } from "@/features/audience/audience.repo";
import type { BulkJobStarter } from "@/features/bulk-job/start-bulk-job";
import type { MarkdownMessageSender } from "@/features/messaging-send/markdown-message-sender";
import type { MergeValuesRepo } from "@/features/messaging-send/render/merge-values.repo";
import type { MessageRecipientRepo } from "@/features/messaging-send/recipients/message-recipient.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { BulkJobKind, CampaignRecipientStatus, CampaignStatus, EntityType, MessageKind } from "@/generated/prisma";

import {
  CAMPAIGN_SEND_CHUNK,
  CAMPAIGN_WRITE,
  type CampaignChunkResult,
  CampaignChunkResultSchema,
  type CampaignDto,
  CampaignDtoSchema,
  type CampaignIdData,
  CampaignIdSchema,
} from "../campaign.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { audienceReferenceFailure } from "@/features/audience/preview/preview-audience.interactor";
import { mergeValuesFrom, parseMergePlaceholders } from "@/features/messaging-send/render/merge-fields";
import { renderEmailMarkdown } from "@/features/messaging-send/render/render-email-markdown";
import { resolveUserLocale } from "@/i18n/user-locale";

@TenantInteractor(CAMPAIGN_WRITE)
export class StartCampaignInteractor extends AuthenticatedInteractor<CampaignIdData, CampaignDto> {
  constructor(
    private repo: CampaignRepo,
    private audiences: AudienceRepo,
    private jobs: BulkJobStarter,
  ) {
    super();
  }

  @Write({ input: CampaignIdSchema, output: CampaignDtoSchema })
  async invoke(data: CampaignIdData): Validated<CampaignDto> {
    const campaign = await this.repo.findCampaignOrNull(data.id);
    if (!campaign) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);
    if (campaign.status !== CampaignStatus.draft) return failConflict(CustomErrorCode.campaignNotDraft, ["id"]);
    if (!campaign.audience || !campaign.subject.trim() || !campaign.bodyMarkdown.trim())
      return failConflict(CustomErrorCode.campaignIncomplete, ["id"]);
    if (!campaign.lawfulBasis?.trim()) return failConflict(CustomErrorCode.campaignLawfulBasisMissing, ["lawfulBasis"]);
    if (!parseMergePlaceholders(campaign.subject).ok || !parseMergePlaceholders(campaign.bodyMarkdown).ok)
      return failConflict(CustomErrorCode.mergeFieldMalformed, ["bodyMarkdown"]);

    const referenceFailure = await audienceReferenceFailure(this.audiences, campaign.audience);
    if (referenceFailure) return referenceFailure;

    if (!(await this.repo.moveStatus(campaign.id, [CampaignStatus.draft], CampaignStatus.sending)))
      return failConflict(CustomErrorCode.campaignNotDraft, ["id"]);

    const started = await this.jobs.start({
      kind: BulkJobKind.campaignSend,
      subjectId: campaign.id,
      definition: { campaignId: campaign.id, audience: campaign.audience },
    });
    if (!started.ok) {
      await this.repo.moveStatus(campaign.id, [CampaignStatus.sending], CampaignStatus.draft);
      return failConflict(CustomErrorCode.bulkJobRunning, ["id"]);
    }

    const sending = await this.repo.findCampaignOrNull(campaign.id);
    if (!sending) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);

    return { ok: true as const, data: sending };
  }
}

@TenantInteractor(CAMPAIGN_WRITE)
export class CancelCampaignInteractor extends AuthenticatedInteractor<CampaignIdData, CampaignDto> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Write({ input: CampaignIdSchema, output: CampaignDtoSchema })
  async invoke(data: CampaignIdData): Validated<CampaignDto> {
    if (!(await this.repo.findCampaignOrNull(data.id))) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);
    if (!(await this.repo.moveStatus(data.id, [CampaignStatus.sending], CampaignStatus.cancelled)))
      return failConflict(CustomErrorCode.campaignNotSending, ["id"]);

    await this.repo.skipPendingRecipients(data.id);
    const campaign = await this.repo.findCampaignOrNull(data.id);
    if (!campaign) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);

    return { ok: true as const, data: campaign };
  }
}

const RECIPIENT_STATUS = {
  sent: CampaignRecipientStatus.sent,
  duplicate: CampaignRecipientStatus.sent,
  suppressed: CampaignRecipientStatus.suppressed,
  failed: CampaignRecipientStatus.failed,
} as const;

@TenantInteractor(CAMPAIGN_WRITE)
export class SendCampaignChunkInteractor extends AuthenticatedInteractor<CampaignIdData, CampaignChunkResult> {
  constructor(
    private repo: CampaignRepo,
    private values: MergeValuesRepo,
    private people: MessageRecipientRepo,
    private messages: MarkdownMessageSender,
  ) {
    super();
  }

  @Write({ input: CampaignIdSchema, output: CampaignChunkResultSchema, tx: false })
  async invoke(data: CampaignIdData): Validated<CampaignChunkResult> {
    const campaign = await this.repo.findCampaignOrNull(data.id);
    if (!campaign) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);
    if (campaign.status !== CampaignStatus.sending) {
      await this.repo.skipPendingRecipients(campaign.id);
      return { ok: true as const, data: { remaining: 0 } };
    }

    const actor = await this.people.findActingUser();
    const locale = resolveUserLocale(actor ?? { displayLanguage: null });

    for (const recipient of await this.repo.findPendingRecipients(campaign.id, CAMPAIGN_SEND_CHUNK)) {
      const source = await this.values.loadMergeSource(
        { entityType: EntityType.contact, entityId: recipient.contactId },
        campaign.senderUserId ?? actor?.id ?? null,
      );
      const rendered = renderEmailMarkdown({
        subject: campaign.subject,
        markdown: campaign.bodyMarkdown,
        values: mergeValuesFrom(source),
      });
      if (!rendered.ok) {
        await this.repo.settleRecipient(recipient.id, CampaignRecipientStatus.failed, {
          deliveryId: null,
          error: "mergeFieldUnresolved",
        });
        continue;
      }

      const outcome = await this.messages.send({
        kind: MessageKind.marketing,
        source: "campaign",
        sourceId: campaign.id,
        campaignId: campaign.id,
        to: recipient.email,
        contactId: recipient.contactId,
        subject: rendered.email.subject,
        html: rendered.email.html,
        locale,
        senderUserId: campaign.senderUserId,
        bannerUrl: campaign.bannerUrl,
      });

      await this.repo.settleRecipient(recipient.id, RECIPIENT_STATUS[outcome.status], {
        deliveryId: "deliveryId" in outcome ? outcome.deliveryId : null,
        error: outcome.status === "failed" ? outcome.code : outcome.status === "suppressed" ? outcome.reason : null,
      });
    }

    return { ok: true as const, data: { remaining: await this.repo.countPending(campaign.id) } };
  }
}

@TenantInteractor(CAMPAIGN_WRITE)
export class FinishCampaignInteractor extends AuthenticatedInteractor<CampaignIdData, CampaignChunkResult> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Write({ input: CampaignIdSchema, output: CampaignChunkResultSchema })
  async invoke(data: CampaignIdData): Validated<CampaignChunkResult> {
    const remaining = await this.repo.countPending(data.id);
    if (remaining === 0) await this.repo.finishCampaign(data.id);

    return { ok: true as const, data: { remaining } };
  }
}

@TenantInteractor(CAMPAIGN_WRITE)
export class FailCampaignInteractor extends AuthenticatedInteractor<CampaignIdData, CampaignChunkResult> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Write({ input: CampaignIdSchema, output: CampaignChunkResultSchema })
  async invoke(data: CampaignIdData): Validated<CampaignChunkResult> {
    await this.repo.moveStatus(data.id, [CampaignStatus.sending], CampaignStatus.failed);

    return { ok: true as const, data: { remaining: await this.repo.countPending(data.id) } };
  }
}
