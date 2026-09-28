import type { Data, Validated } from "@/core/validation/validation.utils";
import type { FindRelationTargetsRepo } from "./relation-target.repo";

import { z } from "zod";

import { RELATION_TARGET_ENTITY_TYPES } from "./relation-target";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const MAX_RELATION_LABEL_IDS = 500;

const Schema = z.object({
  targetEntityType: z.enum(RELATION_TARGET_ENTITY_TYPES),
  ids: z.array(z.string()).max(MAX_RELATION_LABEL_IDS),
});

const RelationTargetLabelSchema = z.object({ id: z.string(), label: z.string() });

export type GetRelationTargetLabelsData = Data<typeof Schema>;
export type RelationTargetLabel = Data<typeof RelationTargetLabelSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetRelationTargetLabelsInteractor extends AuthenticatedInteractor<
  GetRelationTargetLabelsData,
  RelationTargetLabel[]
> {
  constructor(private repo: FindRelationTargetsRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(RelationTargetLabelSchema)
  async invoke(data: GetRelationTargetLabelsData): Validated<RelationTargetLabel[]> {
    const labels = await this.repo.findLabels(data.targetEntityType, data.ids);

    return { ok: true as const, data: [...labels].map(([id, label]) => ({ id, label })) };
  }
}
