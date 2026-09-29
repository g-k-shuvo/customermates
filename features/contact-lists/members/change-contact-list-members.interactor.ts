import type { ContactListRepo } from "../contact-list.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  type ChangeContactListMembersData,
  ChangeContactListMembersSchema,
  CONTACT_LIST_WRITE,
  type MemberChangeDto,
  MemberChangeDtoSchema,
} from "../contact-list.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

@TenantInteractor(CONTACT_LIST_WRITE)
export class AddContactListMembersInteractor extends AuthenticatedInteractor<
  ChangeContactListMembersData,
  MemberChangeDto
> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @Write({ input: ChangeContactListMembersSchema, output: MemberChangeDtoSchema })
  async invoke(data: ChangeContactListMembersData): Validated<MemberChangeDto> {
    if (!(await this.repo.findListOrNull(data.id))) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);

    const accessible = await this.repo.findAccessibleContactIds([...new Set(data.contactIds)]);

    return { ok: true as const, data: { changed: await this.repo.addMembers(data.id, accessible, null) } };
  }
}

@TenantInteractor(CONTACT_LIST_WRITE)
export class RemoveContactListMembersInteractor extends AuthenticatedInteractor<
  ChangeContactListMembersData,
  MemberChangeDto
> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @Write({ input: ChangeContactListMembersSchema, output: MemberChangeDtoSchema })
  async invoke(data: ChangeContactListMembersData): Validated<MemberChangeDto> {
    if (!(await this.repo.findListOrNull(data.id))) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);

    return { ok: true as const, data: { changed: await this.repo.removeMembers(data.id, data.contactIds) } };
  }
}
