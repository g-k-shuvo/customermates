import type { ContactListRepo } from "../contact-list.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  CONTACT_LIST_WRITE,
  type ContactListDto,
  ContactListDtoSchema,
  type ContactListIdData,
  ContactListIdSchema,
} from "../contact-list.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

@TenantInteractor(CONTACT_LIST_WRITE)
export class DeleteContactListInteractor extends AuthenticatedInteractor<ContactListIdData, ContactListDto> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @Write({ input: ContactListIdSchema, output: ContactListDtoSchema })
  async invoke(data: ContactListIdData): Validated<ContactListDto> {
    const list = await this.repo.findListOrNull(data.id);
    if (!list) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);

    await this.repo.deleteList(data.id);

    return { ok: true as const, data: list };
  }
}
