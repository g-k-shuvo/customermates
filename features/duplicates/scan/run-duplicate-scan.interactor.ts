import type { Validated } from "@/core/validation/validation.utils";
import type { RunDuplicateScanRepo } from "./run-duplicate-scan.repo";

import { z } from "zod";

import {
  type DuplicateScanIdData,
  DuplicateScanIdSchema,
  type DuplicateScanStepData,
  DuplicateScanStepSchema,
} from "../duplicate.schema";
import { clusterDuplicates, oversizedBuckets } from "../duplicate-clusters";
import {
  DUPLICATE_ANY_REVIEW_PERMISSIONS,
  type DuplicatePermissionChecker,
  assertDuplicateAccess,
} from "../duplicate-access";
import { Action } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";

export const MATCH_KEY_PAGE_SIZE = 500;
const REPORTED_SKIPPED_BUCKETS = 20;

const StepResultSchema = z.object({ nextCursor: z.uuid().nullable() });
type StepResult = z.infer<typeof StepResultSchema>;

const FinishResultSchema = z.object({ groupCount: z.number().int() });
type FinishResult = z.infer<typeof FinishResultSchema>;

@TenantInteractor(DUPLICATE_ANY_REVIEW_PERMISSIONS)
export class RebuildDuplicateMatchKeysInteractor extends AuthenticatedInteractor<DuplicateScanStepData, StepResult> {
  constructor(
    private repo: RunDuplicateScanRepo,
    private users: DuplicatePermissionChecker,
  ) {
    super();
  }

  @Write({ input: DuplicateScanStepSchema, output: StepResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: DuplicateScanStepData): Validated<StepResult> {
    const scan = await this.repo.findRunningScanOrNull(data.scanId);
    if (!scan) return { ok: true as const, data: { nextCursor: null } };
    await assertDuplicateAccess(this.users, scan.entityType, [Action.readAll]);

    return {
      ok: true as const,
      data: await this.repo.rebuildKeysPage(scan.entityType, data.cursor, MATCH_KEY_PAGE_SIZE),
    };
  }
}

@TenantInteractor(DUPLICATE_ANY_REVIEW_PERMISSIONS)
export class FinishDuplicateScanInteractor extends AuthenticatedInteractor<DuplicateScanIdData, FinishResult> {
  constructor(
    private repo: RunDuplicateScanRepo,
    private users: DuplicatePermissionChecker,
  ) {
    super();
  }

  @Write({ input: DuplicateScanIdSchema, output: FinishResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: DuplicateScanIdData): Validated<FinishResult> {
    const scan = await this.repo.findRunningScanOrNull(data.scanId);
    if (!scan) return { ok: true as const, data: { groupCount: 0 } };
    await assertDuplicateAccess(this.users, scan.entityType, [Action.readAll]);

    const [keyed, dismissed, recordCount] = await Promise.all([
      this.repo.loadKeys(scan.entityType),
      this.repo.loadDismissedPairs(scan.entityType),
      this.repo.countRecords(scan.entityType),
    ]);

    const clusters = clusterDuplicates(keyed, dismissed);
    await this.repo.replaceOpenGroups(scan, clusters);
    await this.repo.completeScan(scan.id, {
      recordCount,
      groupCount: clusters.length,
      skippedBuckets: oversizedBuckets(keyed, REPORTED_SKIPPED_BUCKETS),
    });

    return { ok: true as const, data: { groupCount: clusters.length } };
  }
}

@TenantInteractor(DUPLICATE_ANY_REVIEW_PERMISSIONS)
export class FailDuplicateScanInteractor extends AuthenticatedInteractor<DuplicateScanIdData, { failed: true }> {
  constructor(private repo: RunDuplicateScanRepo) {
    super();
  }

  @Write({ input: DuplicateScanIdSchema })
  async invoke(data: DuplicateScanIdData): Validated<{ failed: true }> {
    await this.repo.failScan(data.scanId);

    return { ok: true as const, data: { failed: true as const } };
  }
}
