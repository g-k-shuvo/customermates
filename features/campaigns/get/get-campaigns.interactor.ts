import type { CampaignRepo } from "../campaign.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  CAMPAIGN_READ,
  CAMPAIGN_RECIPIENT_PAGE,
  type CampaignDto,
  CampaignDtoSchema,
  type CampaignIdData,
  CampaignIdSchema,
  type CampaignRecipientsDto,
  CampaignRecipientsDtoSchema,
  type GetCampaignRecipientsData,
  GetCampaignRecipientsSchema,
} from "../campaign.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@AllowInDemoMode
@TenantInteractor(CAMPAIGN_READ)
export class GetCampaignsInteractor extends AuthenticatedInteractor<void, CampaignDto[]> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @ValidateOutput(CampaignDtoSchema)
  async invoke(): Validated<CampaignDto[]> {
    return { ok: true as const, data: await this.repo.findCampaignsCompanyWide() };
  }
}

@AllowInDemoMode
@TenantInteractor(CAMPAIGN_READ)
export class GetCampaignInteractor extends AuthenticatedInteractor<CampaignIdData, CampaignDto> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Validate(CampaignIdSchema)
  @ValidateOutput(CampaignDtoSchema)
  async invoke(data: CampaignIdData): Validated<CampaignDto> {
    const campaign = await this.repo.findCampaignOrNull(data.id);
    if (!campaign) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);

    return { ok: true as const, data: campaign };
  }
}

@AllowInDemoMode
@TenantInteractor(CAMPAIGN_READ)
export class GetCampaignRecipientsInteractor extends AuthenticatedInteractor<
  GetCampaignRecipientsData,
  CampaignRecipientsDto
> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Validate(GetCampaignRecipientsSchema)
  @ValidateOutput(CampaignRecipientsDtoSchema)
  async invoke(data: GetCampaignRecipientsData): Validated<CampaignRecipientsDto> {
    if (!(await this.repo.findCampaignOrNull(data.id))) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);

    return {
      ok: true as const,
      data: await this.repo.findRecipients(data.id, data.page ?? 1, CAMPAIGN_RECIPIENT_PAGE),
    };
  }
}
