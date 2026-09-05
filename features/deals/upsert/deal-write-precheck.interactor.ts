import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateLostReasonIdsInteractor } from "@/core/validation/validators/validate-lost-reason-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidatePipelineIdsInteractor } from "@/core/validation/validators/validate-pipeline-ids.interactor";
import type { ValidatePipelineStageIdsInteractor } from "@/core/validation/validators/validate-pipeline-stage-ids.interactor";
import type { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { FindDealPipelinesRepo } from "@/features/deals/find-deal-pipelines.repo";
import type { FindArchivedPipelinesRepo } from "@/features/pipelines/find-archived-pipelines.repo";
import type { FindStagePipelineRepo } from "@/features/pipelines/find-stage-pipeline.repo";
import type { CreateDealData } from "./create-deal.interactor";
import type { UpdateDealData } from "./update-deal.interactor";
import type { CreateManyDealsData } from "./create-many-deals.interactor";
import type { UpdateManyDealsData } from "./update-many-deals.interactor";
import type { DeleteDealData } from "../delete/delete-deal.interactor";
import type { DeleteManyDealsData } from "../delete/delete-many-deals.interactor";
import type { MarkDealWonData } from "../close/mark-deal-won.interactor";
import type { MarkDealLostData } from "../close/mark-deal-lost.interactor";
import type { ReopenDealData } from "../close/reopen-deal.interactor";

import { Resource, EntityType } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { unique } from "@/core/utils/unique";

type StagePlacementEntry = {
  dealId?: string | null;
  pipelineId?: string | null;
  stageId?: string | null;
  path: (string | number)[];
  pipelinePath: (string | number)[];
};

type ArchivedPipelineTarget = { pipelineId: string; path: (string | number)[] };

export class DealWritePrecheckInteractor {
  constructor(
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private serviceValidator: ValidateServiceIdsInteractor,
    private taskValidator: ValidateTaskIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
    private pipelineValidator: ValidatePipelineIdsInteractor,
    private stageValidator: ValidatePipelineStageIdsInteractor,
    private stagePipelineRepo: FindStagePipelineRepo,
    private archivedPipelineRepo: FindArchivedPipelinesRepo,
    private dealPipelineRepo: FindDealPipelinesRepo,
    private lostReasonValidator: ValidateLostReasonIdsInteractor,
  ) {}

  async create(data: CreateDealData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.serviceValidator.invoke([{ ids: data.services.map((s) => s.serviceId), path: ["services"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.pipelineValidator.invoke([{ ids: data.pipelineId, path: ["pipelineId"] }], ctx),
      this.stageValidator.invoke([{ ids: data.stageId, path: ["stageId"] }], ctx),
      this.checkPipelinePlacement(
        [{ pipelineId: data.pipelineId, stageId: data.stageId, path: ["stageId"], pipelinePath: ["pipelineId"] }],
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.deals, ctx),
    ]);
  }

  async update(data: UpdateDealData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.dealValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.organizationValidator.invoke([{ ids: data.organizationIds, path: ["organizationIds"] }], ctx),
      this.userValidator.invoke([{ ids: data.userIds, path: ["userIds"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactIds, path: ["contactIds"] }], ctx),
      this.serviceValidator.invoke([{ ids: data.services?.map((s) => s.serviceId), path: ["services"] }], ctx),
      this.taskValidator.invoke([{ ids: data.taskIds, path: ["taskIds"] }], ctx),
      this.pipelineValidator.invoke([{ ids: data.pipelineId, path: ["pipelineId"] }], ctx),
      this.stageValidator.invoke([{ ids: data.stageId, path: ["stageId"] }], ctx),
      this.checkPipelinePlacement(
        [
          {
            dealId: data.id,
            pipelineId: data.pipelineId,
            stageId: data.stageId,
            path: ["stageId"],
            pipelinePath: ["pipelineId"],
          },
        ],
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke([{ userIds: data.userIds, path: ["userIds"] }], Resource.deals, ctx),
    ]);
  }

  async createMany(data: CreateManyDealsData, ctx: z.RefinementCtx) {
    const allServiceIds = unique(data.deals.flatMap((deal) => deal.services.map((s) => s.serviceId)));
    await Promise.all([
      this.organizationValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.organizationIds, path: ["deals", i, "organizationIds"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.userIds, path: ["deals", i, "userIds"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.contactIds, path: ["deals", i, "contactIds"] })),
        ctx,
      ),
      this.serviceValidator.invoke(
        data.deals.map((deal, i) => ({ ids: allServiceIds, path: ["deals", i, "services"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.taskIds, path: ["deals", i, "taskIds"] })),
        ctx,
      ),
      this.pipelineValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.pipelineId, path: ["deals", i, "pipelineId"] })),
        ctx,
      ),
      this.stageValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.stageId, path: ["deals", i, "stageId"] })),
        ctx,
      ),
      this.checkPipelinePlacement(
        data.deals.map((deal, i) => ({
          pipelineId: deal.pipelineId,
          stageId: deal.stageId,
          path: ["deals", i, "stageId"],
          pipelinePath: ["deals", i, "pipelineId"],
        })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.deals.map((deal, i) => ({ values: deal.customFieldValues, path: ["deals", i, "customFieldValues"] })),
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.deals.map((deal, i) => ({ userIds: deal.userIds, path: ["deals", i, "userIds"] })),
        Resource.deals,
        ctx,
      ),
    ]);
  }

  async updateMany(data: UpdateManyDealsData, ctx: z.RefinementCtx) {
    const allServiceIds = unique(data.deals.flatMap((deal) => deal.services?.map((s) => s.serviceId) ?? []));
    await Promise.all([
      this.dealValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.id, path: ["deals", i, "id"] })),
        ctx,
      ),
      this.organizationValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.organizationIds, path: ["deals", i, "organizationIds"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.userIds, path: ["deals", i, "userIds"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.contactIds, path: ["deals", i, "contactIds"] })),
        ctx,
      ),
      this.serviceValidator.invoke(
        data.deals.map((deal, i) => ({ ids: allServiceIds, path: ["deals", i, "services"] })),
        ctx,
      ),
      this.taskValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.taskIds, path: ["deals", i, "taskIds"] })),
        ctx,
      ),
      this.pipelineValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.pipelineId, path: ["deals", i, "pipelineId"] })),
        ctx,
      ),
      this.stageValidator.invoke(
        data.deals.map((deal, i) => ({ ids: deal.stageId, path: ["deals", i, "stageId"] })),
        ctx,
      ),
      this.checkPipelinePlacement(
        data.deals.map((deal, i) => ({
          dealId: deal.id,
          pipelineId: deal.pipelineId,
          stageId: deal.stageId,
          path: ["deals", i, "stageId"],
          pipelinePath: ["deals", i, "pipelineId"],
        })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.deals.map((deal, i) => ({ values: deal.customFieldValues, path: ["deals", i, "customFieldValues"] })),
        EntityType.deal,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.deals.map((deal, i) => ({ userIds: deal.userIds, path: ["deals", i, "userIds"] })),
        Resource.deals,
        ctx,
      ),
    ]);
  }

  async delete(data: DeleteDealData, ctx: z.RefinementCtx) {
    await this.dealValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async deleteMany(data: DeleteManyDealsData, ctx: z.RefinementCtx) {
    await this.dealValidator.invoke([{ ids: data.ids, path: ["ids"] }], ctx);
  }

  async markWon(data: MarkDealWonData, ctx: z.RefinementCtx) {
    await this.dealValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async markLost(data: MarkDealLostData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.dealValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.lostReasonValidator.invoke([{ ids: data.lostReasonId, path: ["lostReasonId"] }], ctx),
    ]);
  }

  async reopen(data: ReopenDealData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.dealValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.stageValidator.invoke([{ ids: data.stageId, path: ["stageId"] }], ctx),
    ]);
  }

  private async checkPipelinePlacement(entries: StagePlacementEntry[], ctx: z.RefinementCtx) {
    const stageIds = new Set(entries.flatMap(({ stageId }) => (stageId ? [stageId] : [])));
    const dealIds = new Set(entries.flatMap(({ dealId }) => (dealId ? [dealId] : [])));

    const [stagePipelineIds, storedPipelineIds] = await Promise.all([
      stageIds.size > 0 ? this.stagePipelineRepo.findPipelineIdsByStageIds(stageIds) : new Map<string, string>(),
      dealIds.size > 0 ? this.dealPipelineRepo.findPipelineIdsByDealIds(dealIds) : new Map<string, string>(),
    ]);

    const targets: ArchivedPipelineTarget[] = [];

    for (const { dealId, pipelineId, stageId, path, pipelinePath } of entries) {
      const stagePipelineId = stageId ? stagePipelineIds.get(stageId) : undefined;

      if (pipelineId && stageId && stagePipelineId && stagePipelineId !== pipelineId) {
        ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.pipelineStageMismatch }, path });
        continue;
      }

      const target = pipelineId
        ? { pipelineId, path: pipelinePath }
        : stagePipelineId
          ? { pipelineId: stagePipelineId, path }
          : null;
      if (!target) continue;

      const storedPipelineId = dealId ? storedPipelineIds.get(dealId) : undefined;
      if (storedPipelineId === target.pipelineId) continue;

      targets.push(target);
    }

    if (targets.length === 0) return;

    const archived = await this.archivedPipelineRepo.findArchivedIds(
      new Set(targets.map((target) => target.pipelineId)),
    );

    for (const { pipelineId, path } of targets) {
      if (archived.has(pipelineId))
        ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.pipelineArchived }, path });
    }
  }
}
