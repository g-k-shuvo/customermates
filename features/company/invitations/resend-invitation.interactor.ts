import type { ManageInvitationRepo } from "./invitation.repo";
import type { Validated } from "@/core/validation/validation.utils";
import type { InviteUsersByEmailInteractor } from "@/features/company/invite-users-by-email.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type InvitationIdData, InvitationIdSchema } from "./invitation.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@TenantInteractor({ resource: Resource.users, action: Action.create })
export class ResendInvitationInteractor extends AuthenticatedInteractor<InvitationIdData, string> {
  constructor(
    private repo: ManageInvitationRepo,
    private inviteUsersByEmail: InviteUsersByEmailInteractor,
  ) {
    super();
  }

  @Validate(InvitationIdSchema)
  @ValidateOutput(z.string())
  async invoke(data: InvitationIdData): Validated<string> {
    const invitation = await this.repo.findEmailInvitation(data.id);
    if (!invitation) return failNotFound(CustomErrorCode.invitationNotFound, ["id"]);

    const sent = await this.inviteUsersByEmail.invoke({ emails: [invitation.email] });
    if (!sent.ok) return sent;

    return { ok: true as const, data: invitation.id };
  }
}
