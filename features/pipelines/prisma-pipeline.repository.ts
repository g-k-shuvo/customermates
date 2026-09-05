import type { RepoArgs } from "@/core/utils/types";
import type { FindPipelinesByIdsRepo } from "./find-pipelines-by-ids.repo";
import type { FindPipelineStagesByIdsRepo } from "./find-pipeline-stages-by-ids.repo";
import type { FindStagePipelineRepo } from "./find-stage-pipeline.repo";
import type { FindTerminalStageRepo } from "./find-terminal-stage.repo";
import type { GetCompanyWidePipelineRepo } from "./get-company-wide-pipeline.repo";
import type { GetDefaultPipelineRepo } from "./get-default-pipeline.repo";
import type { GetPipelinesRepo } from "./get/get-pipelines.interactor";
import type { GetPipelineByIdRepo } from "./get/get-pipeline-by-id.interactor";
import type { CreatePipelineRepo } from "./upsert/create-pipeline.repo";
import type { UpdatePipelineRepo } from "./upsert/update-pipeline.repo";
import type { ReorderStagesRepo } from "./upsert/reorder-stages.repo";
import type { DeletePipelineRepo } from "./delete/delete-pipeline.repo";
import type { CreateStageRepo } from "./stages/create-stage.repo";
import type { UpdateStageRepo } from "./stages/update-stage.repo";
import type { DeleteStageRepo } from "./stages/delete-stage.repo";

import type { Prisma, StageKind } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { getDealRepo } from "@/core/di";

export class PrismaPipelineRepo
  extends BaseRepository
  implements
    FindPipelinesByIdsRepo,
    FindStagePipelineRepo,
    FindTerminalStageRepo,
    GetCompanyWidePipelineRepo,
    GetDefaultPipelineRepo,
    GetPipelinesRepo,
    GetPipelineByIdRepo,
    CreatePipelineRepo,
    UpdatePipelineRepo,
    ReorderStagesRepo,
    DeletePipelineRepo,
    CreateStageRepo,
    UpdateStageRepo,
    DeleteStageRepo
{
  private get stageSelect() {
    return {
      id: true,
      name: true,
      position: true,
      probability: true,
      rottingDays: true,
      kind: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private get pipelineSelect() {
    return {
      id: true,
      name: true,
      position: true,
      isDefault: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      stages: { select: this.stageSelect, orderBy: { position: "asc" } },
    } as const;
  }

  async getPipelines() {
    const { companyId } = this.user;

    return this.prisma.pipeline.findMany({
      where: { companyId },
      select: this.pipelineSelect,
      orderBy: { position: "asc" },
    });
  }

  async getPipelineById(id: string) {
    const { companyId } = this.user;

    return this.prisma.pipeline.findFirst({
      where: { id, companyId },
      select: this.pipelineSelect,
    });
  }

  async getOrThrowCompanyWide(id: string) {
    const { companyId } = this.user;

    return this.prisma.pipeline.findFirstOrThrow({
      where: { id, companyId },
      select: this.pipelineSelect,
    });
  }

  async getManyOrThrowCompanyWide(ids: string[]) {
    if (ids.length === 0) return [];

    const { companyId } = this.user;
    const uniqueIds = [...new Set(ids)];

    const pipelines = await this.prisma.pipeline.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: this.pipelineSelect,
      orderBy: { id: "asc" },
    });

    if (pipelines.length !== uniqueIds.length) throw new Error("One or more pipelines not found");

    return pipelines;
  }

  async getDefaultPipelineWithFirstStage() {
    const { companyId } = this.user;

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { companyId, isDefault: true, archivedAt: null },
      select: { id: true, stages: { select: { id: true }, orderBy: { position: "asc" }, take: 1 } },
      orderBy: { position: "asc" },
    });

    const stageId = pipeline?.stages[0]?.id;

    if (!pipeline || !stageId) return null;

    return { pipelineId: pipeline.id, stageId };
  }

  async getFirstStageOfPipeline(pipelineId: string) {
    const { companyId } = this.user;

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { companyId, pipelineId },
      select: { id: true },
      orderBy: { position: "asc" },
    });

    return stage?.id ?? null;
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { companyId } = this.user;

    const pipelines = await this.prisma.pipeline.findMany({
      where: { id: { in: [...ids] }, companyId },
      select: { id: true },
    });

    return new Set(pipelines.map((pipeline) => pipeline.id));
  }

  async findPipelineIdsByStageIds(ids: Set<string>) {
    if (ids.size === 0) return new Map<string, string>();

    const { companyId } = this.user;

    const stages = await this.prisma.pipelineStage.findMany({
      where: { id: { in: [...ids] }, companyId },
      select: { id: true, pipelineId: true },
    });

    return new Map(stages.map((stage) => [stage.id, stage.pipelineId]));
  }

  async findStageIdByKind(pipelineId: string, kind: StageKind) {
    const { companyId } = this.user;

    const stage = await this.prisma.pipelineStage.findFirst({
      where: { companyId, pipelineId, kind },
      select: { id: true },
      orderBy: { position: "asc" },
    });

    return stage?.id ?? null;
  }

  async demoteDefaultPipelinesExcept(pipelineId: string | null) {
    const { companyId } = this.user;

    await this.prisma.pipeline.updateMany({
      where: { companyId, isDefault: true, ...(pipelineId ? { id: { not: pipelineId } } : {}) },
      data: { isDefault: false },
    });
  }

  @Transaction
  async createPipelineOrThrow(args: RepoArgs<CreatePipelineRepo, "createPipelineOrThrow">) {
    const { companyId } = this.user;

    const created = await this.prisma.pipeline.create({
      data: {
        companyId,
        name: args.name,
        position: args.position,
        isDefault: args.isDefault,
        stages: {
          create: args.stages.map((stage, index) => ({
            companyId,
            name: stage.name,
            position: index,
            probability: stage.probability,
            rottingDays: stage.rottingDays,
            kind: stage.kind,
          })),
        },
      },
      select: { id: true },
    });

    return this.prisma.pipeline.findFirstOrThrow({
      where: { id: created.id, companyId },
      select: this.pipelineSelect,
    });
  }

  @Transaction
  async updatePipelineOrThrow(args: RepoArgs<UpdatePipelineRepo, "updatePipelineOrThrow">) {
    const { companyId } = this.user;
    const { id, ...fields } = args;

    const data: Prisma.PipelineUncheckedUpdateManyInput = {};

    if (fields.name !== undefined) data.name = fields.name;
    if (fields.position !== undefined) data.position = fields.position;
    if (fields.isDefault !== undefined) data.isDefault = fields.isDefault;
    if (fields.archivedAt !== undefined) data.archivedAt = fields.archivedAt;

    await this.prisma.pipeline.updateMany({ where: { id, companyId }, data });

    return this.prisma.pipeline.findFirstOrThrow({ where: { id, companyId }, select: this.pipelineSelect });
  }

  @Transaction
  async reorderStagesOrThrow(pipelineId: string, stageIds: string[]) {
    const { companyId } = this.user;

    await Promise.all(
      stageIds.map((stageId, index) =>
        this.prisma.pipelineStage.updateMany({
          where: { id: stageId, companyId, pipelineId },
          data: { position: index },
        }),
      ),
    );

    const trailing = await this.prisma.pipelineStage.findMany({
      where: { companyId, pipelineId, id: { notIn: stageIds } },
      select: { id: true },
      orderBy: { position: "asc" },
    });

    await Promise.all(
      trailing.map((stage, index) =>
        this.prisma.pipelineStage.updateMany({
          where: { id: stage.id, companyId, pipelineId },
          data: { position: stageIds.length + index },
        }),
      ),
    );

    return this.prisma.pipeline.findFirstOrThrow({
      where: { id: pipelineId, companyId },
      select: this.pipelineSelect,
    });
  }

  @Transaction
  async deletePipelineOrThrow(id: string) {
    const { companyId } = this.user;

    const pipeline = await this.prisma.pipeline.findFirstOrThrow({
      where: { id, companyId },
      select: this.pipelineSelect,
    });

    await this.prisma.pipeline.deleteMany({ where: { id, companyId } });

    return pipeline;
  }

  private async nextStagePosition(pipelineId: string) {
    const { companyId } = this.user;

    const last = await this.prisma.pipelineStage.findFirst({
      where: { companyId, pipelineId },
      select: { position: true },
      orderBy: { position: "desc" },
    });

    return last ? last.position + 1 : 0;
  }

  @Transaction
  async createStageOrThrow(args: RepoArgs<CreateStageRepo, "createStageOrThrow">) {
    const { companyId } = this.user;

    const pipeline = await this.prisma.pipeline.findFirstOrThrow({
      where: { id: args.pipelineId, companyId },
      select: { id: true },
    });

    const position = args.position ?? (await this.nextStagePosition(pipeline.id));

    return this.prisma.pipelineStage.create({
      data: {
        companyId,
        pipelineId: pipeline.id,
        name: args.name,
        position,
        probability: args.probability,
        rottingDays: args.rottingDays ?? null,
        kind: args.kind,
      },
      select: this.stageSelect,
    });
  }

  @Transaction
  async updateStageOrThrow(args: RepoArgs<UpdateStageRepo, "updateStageOrThrow">) {
    const { companyId } = this.user;
    const { id, ...fields } = args;

    const previous = await this.prisma.pipelineStage.findFirstOrThrow({
      where: { id, companyId },
      select: { probability: true, rottingDays: true },
    });

    const data: Prisma.PipelineStageUncheckedUpdateManyInput = {};

    if (fields.name !== undefined) data.name = fields.name;
    if (fields.position !== undefined) data.position = fields.position;
    if (fields.probability !== undefined) data.probability = fields.probability;
    if (fields.rottingDays !== undefined) data.rottingDays = fields.rottingDays;
    if (fields.kind !== undefined) data.kind = fields.kind;

    await this.prisma.pipelineStage.updateMany({ where: { id, companyId }, data });

    const probabilityChanged = fields.probability !== undefined && fields.probability !== previous.probability;
    const rottingDaysChanged = fields.rottingDays !== undefined && fields.rottingDays !== previous.rottingDays;

    if (probabilityChanged || rottingDaysChanged) await this.recalculateDeals(await this.findDealIdsInStage(id));

    return this.prisma.pipelineStage.findFirstOrThrow({ where: { id, companyId }, select: this.stageSelect });
  }

  private async findDealIdsInStage(stageId: string) {
    const { companyId } = this.user;

    const deals = await this.prisma.deal.findMany({ where: { companyId, stageId }, select: { id: true } });

    return deals.map((deal) => deal.id);
  }

  private async recalculateDeals(dealIds: string[]) {
    if (dealIds.length === 0) return;

    const dealRepo = getDealRepo();

    await dealRepo.recalculateTotals(dealIds);
    await dealRepo.recalculateRotting(dealIds);
  }

  async countStagesInPipeline(pipelineId: string) {
    const { companyId } = this.user;

    return this.prisma.pipelineStage.count({ where: { pipelineId, companyId } });
  }

  async countDealsInStage(stageId: string) {
    const { companyId } = this.user;

    return this.prisma.deal.count({ where: { stageId, companyId } });
  }

  async countDealsInPipeline(pipelineId: string) {
    const { companyId } = this.user;

    return this.prisma.deal.count({ where: { pipelineId, companyId } });
  }

  async moveDealsToStage(fromStageId: string, toStageId: string) {
    const { companyId } = this.user;

    const movedDealIds = await this.findDealIdsInStage(fromStageId);

    if (movedDealIds.length === 0) return [];

    const before = await getDealRepo().getManyOrThrowCompanyWide(movedDealIds);

    await this.prisma.deal.updateMany({
      where: { companyId, stageId: fromStageId },
      data: { stageId: toStageId, stageEnteredAt: new Date() },
    });

    await this.recalculateDeals(movedDealIds);

    const after = await getDealRepo().getManyOrThrowCompanyWide(movedDealIds);
    const afterById = new Map(after.map((deal) => [deal.id, deal]));

    return before.flatMap((deal) => {
      const updated = afterById.get(deal.id);

      return updated ? [{ before: deal, after: updated }] : [];
    });
  }

  @Transaction
  async deleteStageOrThrow(id: string) {
    const { companyId } = this.user;

    const stage = await this.prisma.pipelineStage.findFirstOrThrow({
      where: { id, companyId },
      select: this.stageSelect,
    });

    const strandedDealIds = await this.findDealIdsInStage(id);

    await this.prisma.pipelineStage.deleteMany({ where: { id, companyId } });

    await this.recalculateDeals(strandedDealIds);

    return stage;
  }
}

export class PrismaPipelineStageRepo extends BaseRepository implements FindPipelineStagesByIdsRepo {
  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { companyId } = this.user;

    const stages = await this.prisma.pipelineStage.findMany({
      where: { id: { in: [...ids] }, companyId },
      select: { id: true },
    });

    return new Set(stages.map((stage) => stage.id));
  }
}
