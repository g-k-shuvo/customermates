import type { CampaignRepo } from "../campaign.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  CAMPAIGN_WRITE,
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

@TenantInteractor(CAMPAIGN_WRITE)
export class DeleteCampaignInteractor extends AuthenticatedInteractor<CampaignIdData, CampaignDto> {
  constructor(private repo: CampaignRepo) {
    super();
  }

  @Write({ input: CampaignIdSchema, output: CampaignDtoSchema })
  async invoke(data: CampaignIdData): Validated<CampaignDto> {
    const campaign = await this.repo.findCampaignOrNull(data.id);
    if (!campaign) return failNotFound(CustomErrorCode.campaignNotFound, ["id"]);
    if (!(await this.repo.deleteDraft(data.id))) return failConflict(CustomErrorCode.campaignNotDraft, ["id"]);

    return { ok: true as const, data: campaign };
  }
}
