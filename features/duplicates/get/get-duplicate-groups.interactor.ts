import type { Validated } from "@/core/validation/validation.utils";
import type { GetDuplicateGroupsRepo } from "./get-duplicate-groups.repo";

import {
  DUPLICATE_GROUP_PAGE_SIZE,
  type DuplicateGroupListDto,
  DuplicateGroupListDtoSchema,
  type GetDuplicateGroupsData,
  GetDuplicateGroupsSchema,
} from "../duplicate.schema";
import {
  DUPLICATE_ANY_REVIEW_PERMISSIONS,
  type DuplicatePermissionChecker,
  assertDuplicateAccess,
} from "../duplicate-access";
import { Action } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@AllowInDemoMode
@TenantInteractor(DUPLICATE_ANY_REVIEW_PERMISSIONS)
export class GetDuplicateGroupsInteractor extends AuthenticatedInteractor<
  GetDuplicateGroupsData,
  DuplicateGroupListDto
> {
  constructor(
    private repo: GetDuplicateGroupsRepo,
    private users: DuplicatePermissionChecker,
  ) {
    super();
  }

  @Validate(GetDuplicateGroupsSchema)
  @ValidateOutput(DuplicateGroupListDtoSchema)
  async invoke(data: GetDuplicateGroupsData): Validated<DuplicateGroupListDto> {
    await assertDuplicateAccess(this.users, data.entityType, [Action.readAll]);
    const page = data.page ?? 1;
    const [scan, groups, total] = await Promise.all([
      this.repo.findLatestScanOrNull(data.entityType),
      this.repo.listOpenGroups(data.entityType, (page - 1) * DUPLICATE_GROUP_PAGE_SIZE, DUPLICATE_GROUP_PAGE_SIZE),
      this.repo.countOpenGroups(data.entityType),
    ]);

    return { ok: true as const, data: { scan, groups, total, page, pageSize: DUPLICATE_GROUP_PAGE_SIZE } };
  }
}
