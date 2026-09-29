import type { ContactListRepo } from "../contact-list.repo";
import type { BulkJobStarter } from "@/features/bulk-job/start-bulk-job";
import type { BulkJobDto } from "@/features/bulk-job/bulk-job.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { BulkJobKind, type Prisma } from "@/generated/prisma";

import {
  CONTACT_LIST_WRITE,
  type FillContactListData,
  FillContactListResultSchema,
  FillContactListSchema,
} from "../contact-list.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

@TenantInteractor(CONTACT_LIST_WRITE)
export class FillContactListInteractor extends AuthenticatedInteractor<FillContactListData, BulkJobDto> {
  constructor(
    private repo: ContactListRepo,
    private jobs: BulkJobStarter,
  ) {
    super();
  }

  @Write({ input: FillContactListSchema, output: FillContactListResultSchema })
  async invoke(data: FillContactListData): Validated<BulkJobDto> {
    if (!(await this.repo.findListOrNull(data.id))) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);

    const started = await this.jobs.start({
      kind: BulkJobKind.contactListFill,
      subjectId: data.id,
      definition: { filters: data.filters ?? [], searchTerm: data.searchTerm ?? null } as Prisma.InputJsonValue,
    });
    if (!started.ok) return failConflict(CustomErrorCode.bulkJobRunning, ["id"]);

    return { ok: true as const, data: started.job };
  }
}
