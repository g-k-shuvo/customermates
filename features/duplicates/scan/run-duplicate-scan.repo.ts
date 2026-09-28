import type { DuplicateEntityType, SkippedBucket } from "../duplicate.schema";
import type { DuplicateCluster, KeyedRecord } from "../duplicate-clusters";

export type RunningScan = { id: string; entityType: DuplicateEntityType };

export abstract class RunDuplicateScanRepo {
  abstract findRunningScanOrNull(scanId: string): Promise<RunningScan | null>;
  abstract rebuildKeysPage(
    entityType: DuplicateEntityType,
    cursor: string | null,
    take: number,
  ): Promise<{ nextCursor: string | null }>;
  abstract loadKeys(entityType: DuplicateEntityType): Promise<KeyedRecord[]>;
  abstract countRecords(entityType: DuplicateEntityType): Promise<number>;
  abstract loadDismissedPairs(entityType: DuplicateEntityType): Promise<Set<string>>;
  abstract replaceOpenGroups(scan: RunningScan, clusters: readonly DuplicateCluster[]): Promise<void>;
  abstract completeScan(
    scanId: string,
    summary: { recordCount: number; groupCount: number; skippedBuckets: SkippedBucket[] },
  ): Promise<void>;
  abstract failScan(scanId: string): Promise<void>;
}
