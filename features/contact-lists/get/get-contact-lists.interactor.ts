import type { ContactListRepo } from "../contact-list.repo";
import type { Validated } from "@/core/validation/validation.utils";

import {
  CONTACT_LIST_READ,
  type ContactListDto,
  ContactListDtoSchema,
  type ContactListIdData,
  ContactListIdSchema,
  type ContactListMembersDto,
  ContactListMembersDtoSchema,
  type GetContactListMembersData,
  GetContactListMembersSchema,
  MEMBER_PAGE_SIZE,
} from "../contact-list.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@AllowInDemoMode
@TenantInteractor(CONTACT_LIST_READ)
export class GetContactListsInteractor extends AuthenticatedInteractor<void, ContactListDto[]> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @ValidateOutput(ContactListDtoSchema)
  async invoke(): Validated<ContactListDto[]> {
    return { ok: true as const, data: await this.repo.findListsCompanyWide() };
  }
}

@AllowInDemoMode
@TenantInteractor(CONTACT_LIST_READ)
export class GetContactListInteractor extends AuthenticatedInteractor<ContactListIdData, ContactListDto> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @Validate(ContactListIdSchema)
  @ValidateOutput(ContactListDtoSchema)
  async invoke(data: ContactListIdData): Validated<ContactListDto> {
    const list = await this.repo.findListOrNull(data.id);
    if (!list) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);

    return { ok: true as const, data: list };
  }
}

@AllowInDemoMode
@TenantInteractor(CONTACT_LIST_READ)
export class GetContactListMembersInteractor extends AuthenticatedInteractor<
  GetContactListMembersData,
  ContactListMembersDto
> {
  constructor(private repo: ContactListRepo) {
    super();
  }

  @Validate(GetContactListMembersSchema)
  @ValidateOutput(ContactListMembersDtoSchema)
  async invoke(data: GetContactListMembersData): Validated<ContactListMembersDto> {
    const list = await this.repo.findListOrNull(data.id);
    if (!list) return failNotFound(CustomErrorCode.contactListNotFound, ["id"]);

    return { ok: true as const, data: await this.repo.findMembers(data.id, data.page ?? 1, MEMBER_PAGE_SIZE) };
  }
}
