import type { Data, Validated } from "@/core/validation/validation.utils";
import type { Filter } from "@/core/base/base-get.schema";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TaskDtoSchema } from "../task.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { GetQueryParamsApiSchema } from "@/core/base/base-get.schema";

export const ACTIVITY_WINDOW_MAX_DAYS = 14;
export const ACTIVITY_WINDOW_LIMIT = 500;
export const UNDATED_ACTIVITY_LIMIT = 50;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const GetActivityWindowSchema = GetQueryParamsApiSchema.pick({ filters: true, searchTerm: true }).extend({
  from: z.coerce.date(),
  to: z.coerce.date(),
  onlyMine: z.boolean().optional(),
});

export type GetActivityWindowData = Data<typeof GetActivityWindowSchema>;

export const ActivityWindowSchema = z.object({
  dated: z.array(TaskDtoSchema),
  undated: z.array(TaskDtoSchema),
  undatedTotal: z.number().int().min(0),
  truncated: z.boolean(),
});

export type ActivityWindow = Data<typeof ActivityWindowSchema>;

export type ActivityWindowRange = { from: Date; to: Date };

export type ActivityWindowQuery = {
  window: ActivityWindowRange | null;
  onlyMine: boolean;
  searchTerm?: string;
  filters?: Filter[];
  datedLimit: number;
  undatedLimit: number;
};

export abstract class ActivityWindowRepo {
  abstract findActivityWindow(query: ActivityWindowQuery): Promise<Omit<ActivityWindow, "truncated">>;
}

export function clampActivityWindow(from: Date, to: Date): ActivityWindowRange | null {
  const latest = from.getTime() + ACTIVITY_WINDOW_MAX_DAYS * DAY_IN_MS;
  const end = Math.min(to.getTime(), latest);

  return end > from.getTime() ? { from, to: new Date(end) } : null;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetActivityWindowInteractor extends AuthenticatedInteractor<GetActivityWindowData, ActivityWindow> {
  constructor(private repo: ActivityWindowRepo) {
    super();
  }

  @Validate(GetActivityWindowSchema)
  @ValidateOutput(ActivityWindowSchema)
  async invoke(data: GetActivityWindowData): Validated<ActivityWindow> {
    const found = await this.repo.findActivityWindow({
      window: clampActivityWindow(data.from, data.to),
      onlyMine: data.onlyMine ?? false,
      searchTerm: data.searchTerm,
      filters: data.filters,
      datedLimit: ACTIVITY_WINDOW_LIMIT + 1,
      undatedLimit: UNDATED_ACTIVITY_LIMIT,
    });

    return {
      ok: true as const,
      data: {
        ...found,
        dated: found.dated.slice(0, ACTIVITY_WINDOW_LIMIT),
        truncated: found.dated.length > ACTIVITY_WINDOW_LIMIT,
      },
    };
  }
}
