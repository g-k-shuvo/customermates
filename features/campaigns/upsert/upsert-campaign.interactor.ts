import type { CampaignFieldsInput, CampaignRepo } from "../campaign.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { Prisma } from "@/generated/prisma";

import {
  CAMPAIGN_WRITE,
  type CampaignDto,
  CampaignDtoSchema,
  type CreateCampaignData,
  CreateCampaignSchema,
  type UpdateCampaignData,
  UpdateCampaignSchema,
} from "../campaign.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

function fieldsOf(data: CreateCampaignData): CampaignFieldsInput {
  return {
    name: data.name,
    subject: data.subject ?? "",
    bodyMarkdown: data.bodyMarkdown ?? "",
    bannerUrl: data.bannerUrl ?? null,
    audience: (data.audience ?? null) as Prisma.InputJsonValue | null,
    lawfulBasis: data.lawfulBasis ?? null,
    senderUserId: data.senderUserId ?? null,
  };
}

@TenantInteractor(CAMPAIGN_WRITE)
export class CreateCampaignInteractor extends AuthenticatedInteractor<CreateCampaignData, CampaignDto> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Write({ input: CreateCampaignSchema, output: CampaignDtoSchema })
  async invoke(data: CreateCampaignData): Validated<CampaignDto> {
    return { ok: true as const, data: await this.repo.createCampaign(fieldsOf(data)) };
  }
}

@TenantInteractor(CAMPAIGN_WRITE)
export class UpdateCampaignInteractor extends AuthenticatedInteractor<UpdateCampaignData, CampaignDto> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Write({ input: UpdateCampaignSchema, output: CampaignDtoSchema })
  async invoke(data: UpdateCampaignData): Validated<CampaignDto> {
    if (!(await this.repo.findCampaignOrNull(data.id))) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);
    if (!(await this.repo.updateDraft(data.id, fieldsOf(data))))
      return failConflict(CustomErrorCode.campaignNotDraft, ["id"]);

    const campaign = await this.repo.findCampaignOrNull(data.id);
    if (!campaign) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);

    return { ok: true as const, data: campaign };
  }
}
