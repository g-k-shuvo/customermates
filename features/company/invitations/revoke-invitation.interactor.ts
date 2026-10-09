import type { ManageInvitationRepo } from "./invitation.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type InvitationIdData, InvitationIdSchema } from "./invitation.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@TenantInteractor({ resource: Resource.users, action: Action.create })
export class RevokeInvitationInteractor extends AuthenticatedInteractor<InvitationIdData, string> {
  constructor(private repo: ManageInvitationRepo) {
    super();
  }

  @Write({ input: InvitationIdSchema, output: z.string() })
  async invoke(data: InvitationIdData): Validated<string> {
    const invitation = await this.repo.findEmailInvitation(data.id);
    if (!invitation) return failNotFound(CustomErrorCode.invitationNotFound, ["id"]);

    await this.repo.deleteEmailInvitation(invitation.id);

    return { ok: true as const, data: invitation.id };
  }
}
