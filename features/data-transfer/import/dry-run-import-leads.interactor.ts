import type { BulkWritePrecheck } from "@/core/base/base-dry-run-import.interactor";
import type { DryRunImportData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { BaseDryRunImportInteractor } from "@/core/base/base-dry-run-import.interactor";
import { CreateManyLeadsSchema } from "@/features/leads/upsert/create-many-leads.interactor";
import { DryRunImportSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UpdateManyLeadsSchema } from "@/features/leads/upsert/update-many-leads.interactor";
import { Validate } from "@/core/decorators/validate.decorator";

@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.create },
    { resource: Resource.leads, action: Action.update },
  ],
  condition: "OR",
})
export class DryRunImportLeadsInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("leads", CreateManyLeadsSchema, UpdateManyLeadsSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}
