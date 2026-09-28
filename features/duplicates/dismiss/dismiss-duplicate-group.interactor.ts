import type { Validated } from "@/core/validation/validation.utils";
import type { DismissDuplicateGroupRepo } from "./dismiss-duplicate-group.repo";

import { z } from "zod";

import { type DismissDuplicateGroupData, DismissDuplicateGroupSchema } from "../duplicate.schema";
import { orderedPair } from "../duplicate-clusters";
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
import { failNotFound } from "@/core/validation/interactor-failure-server";

export const DismissDuplicateGroupResultSchema = z.object({ id: z.uuid(), dismissedPairs: z.number().int() });
type DismissResult = z.infer<typeof DismissDuplicateGroupResultSchema>;

@TenantInteractor(DUPLICATE_ANY_REVIEW_PERMISSIONS)
export class DismissDuplicateGroupInteractor extends AuthenticatedInteractor<DismissDuplicateGroupData, DismissResult> {
  constructor(
    private repo: DismissDuplicateGroupRepo,
    private users: DuplicatePermissionChecker,
  ) {
    super();
  }

  @Write({ input: DismissDuplicateGroupSchema, output: DismissDuplicateGroupResultSchema })
  async invoke(data: DismissDuplicateGroupData): Validated<DismissResult> {
    const group = await this.repo.findOpenGroupOrNull(data.id);
    if (!group) return failNotFound(CustomErrorCode.duplicateGroupNotFound, ["id"]);
    await assertDuplicateAccess(this.users, group.entityType, [Action.readAll, Action.update]);

    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < group.memberIds.length; i++) {
      for (let j = i + 1; j < group.memberIds.length; j++)
        pairs.push(orderedPair(group.memberIds[i], group.memberIds[j]));
    }

    await this.repo.dismissGroup(data.id, group.entityType, pairs);

    return { ok: true as const, data: { id: data.id, dismissedPairs: pairs.length } };
  }
}
