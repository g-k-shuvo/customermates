import type { GetImportRelationIndexData, RelationIndexResult } from "../data-transfer.schema";
import type { ImportRelationIndex } from "./relation-index.service";
import type { UserService } from "@/features/user/user.service";
import type { Validated } from "@/core/validation/validation.utils";

import { assertImportReadable } from "./import-read-access";
import { GetImportRelationIndexSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

@TenantInteractor()
export class GetImportRelationIndexInteractor extends AuthenticatedInteractor<
  GetImportRelationIndexData,
  RelationIndexResult
> {
  constructor(
    private index: ImportRelationIndex,
    private userService: UserService,
  ) {
    super();
  }

  @Validate(GetImportRelationIndexSchema)
  async invoke(data: GetImportRelationIndexData): Validated<RelationIndexResult> {
    for (const entityType of data.entityTypes) await assertImportReadable(this.userService, entityType);

    return { ok: true as const, data: await this.index.build(data.entityTypes, data.includeUsers ?? false) };
  }
}
