import type { CampaignDto, CampaignRecipientsDto } from "./campaign.schema";
import type { AudienceRecipient } from "@/features/audience/audience.schema";
import type { CampaignRecipientStatus, CampaignStatus, Prisma } from "@/generated/prisma";

export type CampaignFieldsInput = {
  name: string;
  subject: string;
  bodyMarkdown: string;
  bannerUrl: string | null;
  audience: Prisma.InputJsonValue | null;
  lawfulBasis: string | null;
  senderUserId: string | null;
};

export type PendingRecipient = { id: string; contactId: string; email: string };

export abstract class CampaignRepo {
  abstract findCampaignsCompanyWide(): Promise<CampaignDto[]>;
  abstract findCampaignOrNull(id: string): Promise<CampaignDto | null>;
  abstract createCampaign(fields: CampaignFieldsInput): Promise<CampaignDto>;
  abstract updateDraft(id: string, fields: CampaignFieldsInput): Promise<boolean>;
  abstract deleteDraft(id: string): Promise<boolean>;
  abstract moveStatus(id: string, from: readonly CampaignStatus[], to: CampaignStatus): Promise<boolean>;
  abstract addRecipients(campaignId: string, recipients: AudienceRecipient[]): Promise<number>;
  abstract findPendingRecipients(campaignId: string, take: number): Promise<PendingRecipient[]>;
  abstract settleRecipient(
    recipientId: string,
    status: CampaignRecipientStatus,
    details: { deliveryId: string | null; error: string | null },
  ): Promise<void>;
  abstract skipPendingRecipients(campaignId: string): Promise<number>;
  abstract countPending(campaignId: string): Promise<number>;
  abstract finishCampaign(id: string): Promise<void>;
  abstract findRecipients(campaignId: string, page: number, pageSize: number): Promise<CampaignRecipientsDto>;
}
