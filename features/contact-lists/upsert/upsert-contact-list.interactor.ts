import type { ContactListRepo } from "../contact-list.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  CONTACT_LIST_WRITE,
  type ContactListDto,
  ContactListDtoSchema,
  type CreateContactListData,
  CreateContactListSchema,
  type UpdateContactListData,
  UpdateContactListSchema,
} from "../contact-list.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

@TenantInteractor(CONTACT_LIST_WRITE)
export class CreateContactListInteractor extends AuthenticatedInteractor<CreateContactListData, ContactListDto> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @Write({ input: CreateContactListSchema, output: ContactListDtoSchema })
  async invoke(data: CreateContactListData): Validated<ContactListDto> {
    if (await this.repo.listNameTaken(data.name, null))
      return failConflict(CustomErrorCode.contactListNameTaken, ["name"]);

    return {
      ok: true as const,
      data: await this.repo.createList({ name: data.name, description: data.description ?? null }),
    };
  }
}

@TenantInteractor(CONTACT_LIST_WRITE)
export class UpdateContactListInteractor extends AuthenticatedInteractor<UpdateContactListData, ContactListDto> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @Write({ input: UpdateContactListSchema, output: ContactListDtoSchema })
  async invoke(data: UpdateContactListData): Validated<ContactListDto> {
    if (!(await this.repo.findListOrNull(data.id))) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);
    if (await this.repo.listNameTaken(data.name, data.id))
      return failConflict(CustomErrorCode.contactListNameTaken, ["name"]);

    await this.repo.updateList({ id: data.id, name: data.name, description: data.description ?? null });
    const list = await this.repo.findListOrNull(data.id);
    if (!list) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);

    return { ok: true as const, data: list };
  }
}
