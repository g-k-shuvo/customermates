import type { DuplicateEntityType, DuplicateGroupDto, DuplicateScanDto } from "../duplicate.schema";

export abstract class GetDuplicateGroupsRepo {
  abstract findLatestScanOrNull(entityType: DuplicateEntityType): Promise<DuplicateScanDto | null>;
  abstract listOpenGroups(entityType: DuplicateEntityType, skip: number, take: number): Promise<DuplicateGroupDto[]>;
  abstract countOpenGroups(entityType: DuplicateEntityType): Promise<number>;
}
