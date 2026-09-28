import type { DuplicateEntityType } from "../duplicate.schema";

export abstract class DismissDuplicateGroupRepo {
  abstract findOpenGroupOrNull(id: string): Promise<{ entityType: DuplicateEntityType; memberIds: string[] } | null>;
  abstract dismissGroup(id: string, entityType: DuplicateEntityType, pairs: Array<[string, string]>): Promise<void>;
}
