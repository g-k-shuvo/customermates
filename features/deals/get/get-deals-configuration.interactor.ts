import type { SortableFieldDescriptor } from "@/core/base/base-get.schema";
import type { GetConfigurationRepo } from "@/core/base/base-get-configuration.interactor";
import type { GetPipelinesRepo } from "@/features/pipelines/get/get-pipelines.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type DealsConfiguration, DealsConfigurationSchema } from "../deal.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetDealsConfigurationInteractor extends AuthenticatedInteractor<void, DealsConfiguration> {
  constructor(
    private repo: GetConfigurationRepo,
    private pipelineRepo: GetPipelinesRepo,
  ) {
    super();
  }

  @ValidateOutput(DealsConfigurationSchema)
  async invoke(): Promise<{ ok: true; data: DealsConfiguration }> {
    const [customColumns, filterableFields, pipelines] = await Promise.all([
      this.repo.getCustomColumns(),
      this.repo.getFilterableFields(),
      this.pipelineRepo.getPipelines(),
    ]);

    const sortableFields: SortableFieldDescriptor[] = [
      ...this.repo.getSortableFields().map((field) => ({ field: field.field })),
      ...customColumns.map((column) => ({ field: column.id, label: column.label, columnType: column.type })),
    ];

    return { ok: true as const, data: { customColumns, filterableFields, sortableFields, pipelines } };
  }
}
