import type { DuplicateEntityType, DuplicateScanDto } from "../duplicate.schema";

export abstract class StartDuplicateScanRepo {
  abstract findRunningScanOfTypeOrNull(
    entityType: DuplicateEntityType,
  ): Promise<{ id: string; startedAt: Date } | null>;
  abstract createScan(entityType: DuplicateEntityType): Promise<DuplicateScanDto>;
}
