import type { Data, Validated } from "@/core/validation/validation.utils";
import type { FunnelCalculation, FunnelForCalculation } from "./calculator/widget-calculator.types";

import { z } from "zod";

import { FunnelStagePointSchema, FunnelSummarySchema } from "./widget.schema";
import { WIDGET_PERIOD_DAYS_MAX } from "./widget-aggregation";

import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const PreviewFunnelWidgetSchema = z.object({
  pipelineId: z.uuid(),
  periodDays: z.number().int().positive().max(WIDGET_PERIOD_DAYS_MAX).optional(),
});
export type PreviewFunnelWidgetData = Data<typeof PreviewFunnelWidgetSchema>;

const FunnelPreviewSchema = z.object({
  pipelineName: z.string().nullable(),
  stages: z.array(FunnelStagePointSchema),
  summary: FunnelSummarySchema.nullable(),
});

export abstract class PreviewFunnelWidgetRepo {
  abstract calculateFunnelData(widget: FunnelForCalculation): Promise<FunnelCalculation>;
}

@AllowInDemoMode
@TenantInteractor()
export class PreviewFunnelWidgetInteractor extends AuthenticatedInteractor<PreviewFunnelWidgetData, FunnelCalculation> {
  constructor(private repo: PreviewFunnelWidgetRepo) {
    super();
  }

  @Validate(PreviewFunnelWidgetSchema)
  @ValidateOutput(FunnelPreviewSchema)
  async invoke(data: PreviewFunnelWidgetData): Validated<FunnelCalculation> {
    return {
      ok: true as const,
      data: await this.repo.calculateFunnelData({ pipelineId: data.pipelineId, periodDays: data.periodDays ?? null }),
    };
  }
}
