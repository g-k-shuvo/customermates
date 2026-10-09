import type { Data, Validated } from "@/core/validation/validation.utils";
import type { WidgetCalculation, WidgetForCalculation } from "./calculator/widget-calculator.types";

import { z } from "zod";

import { ChartWidgetDtoSchema, DiagramDataPointSchema, WidgetDataSummarySchema } from "./widget.schema";

import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const PreviewChartWidgetSchema = ChartWidgetDtoSchema.pick({
  entityType: true,
  entityFilters: true,
  dealFilters: true,
  groupByType: true,
  groupByCustomColumnId: true,
  aggregationType: true,
  periodDays: true,
  displayOptions: true,
});
export type PreviewChartWidgetData = Data<typeof PreviewChartWidgetSchema>;

const ChartPreviewSchema = z.object({
  data: z.array(DiagramDataPointSchema),
  dataSummary: WidgetDataSummarySchema.nullable(),
});

export abstract class PreviewChartWidgetRepo {
  abstract calculateWidgetData(widget: WidgetForCalculation): Promise<WidgetCalculation>;
}

@AllowInDemoMode
@TenantInteractor()
export class PreviewChartWidgetInteractor extends AuthenticatedInteractor<PreviewChartWidgetData, WidgetCalculation> {
  constructor(private repo: PreviewChartWidgetRepo) {
    super();
  }

  @Validate(PreviewChartWidgetSchema)
  @ValidateOutput(ChartPreviewSchema)
  async invoke(data: PreviewChartWidgetData): Validated<WidgetCalculation> {
    return { ok: true as const, data: await this.repo.calculateWidgetData(data) };
  }
}
