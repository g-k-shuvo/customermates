import type { RelationTargetEntityType } from "./relation-target";

export abstract class FindRelationTargetsRepo {
  abstract findLabels(targetEntityType: RelationTargetEntityType, ids: string[]): Promise<Map<string, string>>;
}
