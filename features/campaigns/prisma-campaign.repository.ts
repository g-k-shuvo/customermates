import type { CampaignFieldsInput, CampaignRepo, PendingRecipient } from "./campaign.repo";
import type { CampaignDto, CampaignRecipientsDto } from "./campaign.schema";
import type { AudienceRecipient } from "@/features/audience/audience.schema";

import { CampaignRecipientStatus, CampaignStatus, Prisma } from "@/generated/prisma";

import { AudienceDefinitionSchema } from "@/features/audience/audience.schema";

import { BaseRepository } from "@/core/base/base-repository";

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  status: true,
  subject: true,
  bodyMarkdown: true,
  bannerUrl: true,
  audience: true,
  lawfulBasis: true,
  senderUserId: true,
  startedAt: true,
  finishedAt: true,
  sentCount: true,
  suppressedCount: true,
  failedCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CampaignRow = Prisma.CampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

function toDto(row: CampaignRow, pendingCount: number): CampaignDto {
  const audience = AudienceDefinitionSchema.safeParse(row.audience);

  return { ...row, audience: audience.success ? audience.data : null, pendingCount };
}

const COUNT_FIELD: Partial<Record<CampaignRecipientStatus, "sentCount" | "suppressedCount" | "failedCount">> = {
  [CampaignRecipientStatus.sent]: "sentCount",
  [CampaignRecipientStatus.suppressed]: "suppressedCount",
  [CampaignRecipientStatus.failed]: "failedCount",
};

export class PrismaCampaignRepo extends BaseRepository implements CampaignRepo {
  private async pendingCounts(ids: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.campaignRecipient.groupBy({
      by: ["campaignId"],
      where: { companyId: this.companyId, campaignId: { in: ids }, status: CampaignRecipientStatus.pending },
      _count: { _all: true },
    });

    return new Map(rows.map((row) => [row.campaignId, row._count._all]));
  }

  async findCampaignsCompanyWide(): Promise<CampaignDto[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { companyId: this.companyId },
      orderBy: { createdAt: "desc" },
      select: CAMPAIGN_SELECT,
    });
    const pending = await this.pendingCounts(rows.map((row) => row.id));

    return rows.map((row) => toDto(row, pending.get(row.id) ?? 0));
  }

  async findCampaignOrNull(id: string): Promise<CampaignDto | null> {
    const row = await this.prisma.campaign.findFirst({
      where: { id, companyId: this.companyId },
      select: CAMPAIGN_SELECT,
    });
    if (!row) return null;

    return toDto(row, (await this.pendingCounts([id])).get(id) ?? 0);
  }

  private data(fields: CampaignFieldsInput) {
    return { ...fields, audience: fields.audience ?? Prisma.JsonNull };
  }

  async createCampaign(fields: CampaignFieldsInput): Promise<CampaignDto> {
    const row = await this.prisma.campaign.create({
      data: { companyId: this.companyId, createdById: this.userId, ...this.data(fields) },
      select: CAMPAIGN_SELECT,
    });

    return toDto(row, 0);
  }

  async updateDraft(id: string, fields: CampaignFieldsInput): Promise<boolean> {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id, companyId: this.companyId, status: CampaignStatus.draft },
      data: this.data(fields),
    });

    return count === 1;
  }

  async deleteDraft(id: string): Promise<boolean> {
    const { count } = await this.prisma.campaign.deleteMany({
      where: { id, companyId: this.companyId, status: CampaignStatus.draft },
    });

    return count === 1;
  }

  async moveStatus(id: string, from: readonly CampaignStatus[], to: CampaignStatus): Promise<boolean> {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id, companyId: this.companyId, status: { in: [...from] } },
      data: {
        status: to,
        ...(to === CampaignStatus.sending ? { startedAt: new Date() } : {}),
        ...(to === CampaignStatus.cancelled || to === CampaignStatus.failed ? { finishedAt: new Date() } : {}),
      },
    });

    return count === 1;
  }

  async addRecipients(campaignId: string, recipients: AudienceRecipient[]): Promise<number> {
    if (recipients.length === 0) return 0;

    const { count } = await this.prisma.campaignRecipient.createMany({
      data: recipients.map((recipient) => ({
        companyId: this.companyId,
        campaignId,
        contactId: recipient.contactId,
        email: recipient.email,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  async findPendingRecipients(campaignId: string, take: number): Promise<PendingRecipient[]> {
    return await this.prisma.campaignRecipient.findMany({
      where: { companyId: this.companyId, campaignId, status: CampaignRecipientStatus.pending },
      orderBy: { id: "asc" },
      take,
      select: { id: true, contactId: true, email: true },
    });
  }

  async settleRecipient(
    recipientId: string,
    status: CampaignRecipientStatus,
    details: { deliveryId: string | null; error: string | null },
  ): Promise<void> {
    const recipient = await this.prisma.campaignRecipient.findFirst({
      where: { id: recipientId, companyId: this.companyId, status: CampaignRecipientStatus.pending },
      select: { campaignId: true },
    });
    if (!recipient) return;

    const { count } = await this.prisma.campaignRecipient.updateMany({
      where: { id: recipientId, companyId: this.companyId, status: CampaignRecipientStatus.pending },
      data: { status, ...details },
    });
    const counter = COUNT_FIELD[status];
    if (count === 1 && counter) {
      await this.prisma.campaign.updateMany({
        where: { id: recipient.campaignId, companyId: this.companyId },
        data: { [counter]: { increment: 1 } },
      });
    }
  }

  async skipPendingRecipients(campaignId: string): Promise<number> {
    const { count } = await this.prisma.campaignRecipient.updateMany({
      where: { companyId: this.companyId, campaignId, status: CampaignRecipientStatus.pending },
      data: { status: CampaignRecipientStatus.skipped },
    });

    return count;
  }

  async countPending(campaignId: string): Promise<number> {
    return await this.prisma.campaignRecipient.count({
      where: { companyId: this.companyId, campaignId, status: CampaignRecipientStatus.pending },
    });
  }

  async finishCampaign(id: string): Promise<void> {
    await this.prisma.campaign.updateMany({
      where: { id, companyId: this.companyId, status: CampaignStatus.sending },
      data: { status: CampaignStatus.sent, finishedAt: new Date() },
    });
  }

  async findRecipients(campaignId: string, page: number, pageSize: number): Promise<CampaignRecipientsDto> {
    const where = { companyId: this.companyId, campaignId };
    const [total, items] = await Promise.all([
      this.prisma.campaignRecipient.count({ where }),
      this.prisma.campaignRecipient.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { contactId: true, email: true, status: true, error: true, updatedAt: true },
      }),
    ]);

    return { items, page, pageSize, total };
  }
}
