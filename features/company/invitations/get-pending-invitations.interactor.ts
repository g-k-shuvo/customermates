import type { PendingInvitationsRepo } from "./invitation.repo";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type PendingInvitationDto, PendingInvitationDtoSchema } from "./invitation.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.users, action: Action.create })
export class GetPendingInvitationsInteractor extends AuthenticatedInteractor<void, PendingInvitationDto[]> {
  constructor(private repo: PendingInvitationsRepo) {
    super();
  }

  @ValidateOutput(PendingInvitationDtoSchema)
  async invoke(): Validated<PendingInvitationDto[]> {
    return { ok: true as const, data: await this.repo.findPendingInvitations() };
  }
}
