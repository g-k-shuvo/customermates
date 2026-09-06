import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetActivityCountsSchema = z.object({
  dayEndsAt: z.coerce.date(),
});

export type GetActivityCountsData = Data<typeof GetActivityCountsSchema>;

export const ActivityCountsSchema = z.object({
  overdue: z.number().int(),
  dueToday: z.number().int(),
});

export type ActivityCounts = Data<typeof ActivityCountsSchema>;

export abstract class ActivityCountsRepo {
  abstract countAssignedActivities(args: { now: Date; dayEndsAt: Date }): Promise<ActivityCounts>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetActivityCountsInteractor extends AuthenticatedInteractor<GetActivityCountsData, ActivityCounts> {
  constructor(private repo: ActivityCountsRepo) {
    super();
  }

  @Validate(GetActivityCountsSchema)
  @ValidateOutput(ActivityCountsSchema)
  async invoke(data: GetActivityCountsData): Validated<ActivityCounts> {
    const counts = await this.repo.countAssignedActivities({ now: new Date(), dayEndsAt: data.dayEndsAt });

    return { ok: true as const, data: counts };
  }
}
