import type { AutomationDto } from "../automation.schema";
import type { Validated } from "@/core/validation/validation.utils";

import z from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AutomationDtoSchema } from "../automation.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export abstract class GetAutomationsRepo {
  abstract listAutomations(): Promise<AutomationDto[]>;
  abstract getAutomationByIdOrThrow(id: string): Promise<AutomationDto>;
}

@TenantInteractor({ resource: Resource.automations, action: Action.readAll })
export class GetAutomationsInteractor extends AuthenticatedInteractor<void, AutomationDto[]> {
  constructor(private repo: GetAutomationsRepo) {
    super();
  }

  @ValidateOutput(z.array(AutomationDtoSchema))
  async invoke(): Validated<AutomationDto[]> {
    return { ok: true as const, data: await this.repo.listAutomations() };
  }
}
