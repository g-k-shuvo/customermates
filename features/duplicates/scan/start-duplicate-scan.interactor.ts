import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { StartDuplicateScanRepo } from "./start-duplicate-scan.repo";

import {
  type DuplicateScanDto,
  DuplicateScanDtoSchema,
  type StartDuplicateScanData,
  StartDuplicateScanSchema,
} from "../duplicate.schema";
import {
  DUPLICATE_ANY_REVIEW_PERMISSIONS,
  type DuplicatePermissionChecker,
  assertDuplicateAccess,
} from "../duplicate-access";
import { Action } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict } from "@/core/validation/interactor-failure-server";

export const STALE_SCAN_AFTER_MS = 30 * 60 * 1000;

@TenantInteractor(DUPLICATE_ANY_REVIEW_PERMISSIONS)
export class StartDuplicateScanInteractor extends AuthenticatedInteractor<StartDuplicateScanData, DuplicateScanDto> {
  constructor(
    private repo: StartDuplicateScanRepo,
    private backgroundTasks: BackgroundTaskService,
    private users: DuplicatePermissionChecker,
  ) {
    super();
  }

  @Write({ input: StartDuplicateScanSchema, output: DuplicateScanDtoSchema })
  async invoke(data: StartDuplicateScanData): Validated<DuplicateScanDto> {
    await assertDuplicateAccess(this.users, data.entityType, [Action.readAll]);

    const running = await this.repo.findRunningScanOfTypeOrNull(data.entityType);
    if (running && Date.now() - running.startedAt.getTime() < STALE_SCAN_AFTER_MS)
      return failConflict(CustomErrorCode.duplicateScanRunning, ["entityType"]);

    const scan = await this.repo.createScan(data.entityType);
    await this.backgroundTasks.dispatch("scan-duplicates", { scanId: scan.id });

    return { ok: true as const, data: scan };
  }
}
