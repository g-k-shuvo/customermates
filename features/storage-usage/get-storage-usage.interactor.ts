import type { StorageQuota } from "@/core/storage/storage-quota";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const StorageUsageDtoSchema = z.object({
  usedBytes: z.number().int().describe("Bytes of record files, documents and stored email attachments"),
  quotaBytes: z.number().int().nullable().describe("The workspace's storage quota in bytes, or null when unlimited"),
});
export type StorageUsageDto = Data<typeof StorageUsageDtoSchema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, action: Action.readAll })
export class GetStorageUsageInteractor extends AuthenticatedInteractor<void, StorageUsageDto> {
  constructor(private quota: StorageQuota) {
    super();
  }

  @ValidateOutput(StorageUsageDtoSchema)
  async invoke(): Validated<StorageUsageDto> {
    return { ok: true as const, data: await this.quota.usage() };
  }
}
