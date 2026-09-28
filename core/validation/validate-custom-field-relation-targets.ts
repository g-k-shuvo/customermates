import type { z } from "zod";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FindRelationTargetsRepo } from "@/features/custom-column/relation-target.repo";
import type { RelationTargetEntityType } from "@/features/custom-column/relation-target";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";

type Entry = {
  values: Array<{ columnId: string; value?: string | null | undefined }> | null | undefined;
  path: (string | number)[];
};

const NOT_FOUND_BY_TARGET: Record<RelationTargetEntityType, CustomErrorCode> = {
  [EntityType.contact]: CustomErrorCode.contactNotFound,
  [EntityType.organization]: CustomErrorCode.organizationNotFound,
  [EntityType.deal]: CustomErrorCode.dealNotFound,
};

export async function validateCustomFieldRelationTargets(
  entries: Entry[],
  columns: CustomColumnDto[],
  ctx: z.RefinementCtx,
  repo: FindRelationTargetsRepo | undefined,
) {
  const targetByColumnId = new Map<string, RelationTargetEntityType>();
  for (const column of columns)
    if (column.type === CustomColumnType.relation) targetByColumnId.set(column.id, column.options.targetEntityType);
  if (targetByColumnId.size === 0) return;

  const checks: Array<{ target: RelationTargetEntityType; id: string; path: (string | number)[] }> = [];
  for (const { values, path } of entries) {
    (values ?? []).forEach((entry, index) => {
      const target = targetByColumnId.get(entry.columnId);
      if (target && entry.value) checks.push({ target, id: entry.value, path: [...path, index, "value"] });
    });
  }
  if (checks.length === 0) return;

  const found = new Map<RelationTargetEntityType, Map<string, string>>();
  for (const target of new Set(checks.map((check) => check.target))) {
    const ids = checks.filter((check) => check.target === target).map((check) => check.id);
    found.set(target, repo ? await repo.findLabels(target, ids) : new Map());
  }

  for (const { target, id, path } of checks) {
    if (!found.get(target)?.has(id))
      ctx.addIssue({ code: "custom", params: { error: NOT_FOUND_BY_TARGET[target] }, path });
  }
}
