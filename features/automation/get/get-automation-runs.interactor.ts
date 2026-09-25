import type { AutomationRunDto } from "../automation.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";

import z from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AutomationRunDtoSchema } from "../automation.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const AUTOMATION_RUN_PAGE_SIZE = 25;

export const GetAutomationRunsSchema = z.object({ automationId: z.uuid() });
export type GetAutomationRunsData = Data<typeof GetAutomationRunsSchema>;

export abstract class GetAutomationRunsRepo {
  abstract listAutomationRuns(automationId: string, take: number): Promise<AutomationRunDto[]>;
}

@TenantInteractor({ resource: Resource.automations, action: Action.readAll })
export class GetAutomationRunsInteractor extends AuthenticatedInteractor<GetAutomationRunsData, AutomationRunDto[]> {
  constructor(private repo: GetAutomationRunsRepo) {
    super();
  }

  @Validate(GetAutomationRunsSchema)
  @ValidateOutput(AutomationRunDtoSchema)
  async invoke(data: GetAutomationRunsData): Validated<AutomationRunDto[]> {
    return { ok: true as const, data: await this.repo.listAutomationRuns(data.automationId, AUTOMATION_RUN_PAGE_SIZE) };
  }
}
