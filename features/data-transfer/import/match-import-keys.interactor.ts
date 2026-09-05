import type { ImportKeyMatcher } from "./import-key-matcher.service";
import type { MatchImportKeysData, MatchImportKeysResult } from "../data-transfer.schema";
import type { UserService } from "@/features/user/user.service";
import type { Validated } from "@/core/validation/validation.utils";

import { assertImportReadable } from "./import-read-access";
import { MatchImportKeysSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

@TenantInteractor()
export class MatchImportKeysInteractor extends AuthenticatedInteractor<MatchImportKeysData, MatchImportKeysResult> {
  constructor(
    private matcher: ImportKeyMatcher,
    private userService: UserService,
  ) {
    super();
  }

  @Validate(MatchImportKeysSchema)
  async invoke(data: MatchImportKeysData): Validated<MatchImportKeysResult> {
    await assertImportReadable(this.userService, data.entityType);

    const matches = await this.matcher.match(data.entityType, data.key, data.values);

    return { ok: true as const, data: { matches } };
  }
}
