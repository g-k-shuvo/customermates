import type { Prisma } from "@/generated/prisma";
import type { GetDealStageDurationsRepo } from "./get-deal-stage-durations.repo";

import { BaseRepository } from "@/core/base/base-repository";

import { summarizeDealStageDurations } from "../deal-stage-durations";

export class PrismaDealStageDurationsRepo
  extends BaseRepository<Prisma.DealWhereInput>
  implements GetDealStageDurationsRepo
{
  async getDealStageDurations(id: string, now: Date) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, ...this.accessWhere("deal") },
      select: {
        id: true,
        pipelineId: true,
        stageId: true,
        stageEnteredAt: true,
        pipeline: {
          select: {
            stages: {
              select: { id: true, name: true, position: true, kind: true },
              orderBy: [{ position: "asc" }, { id: "asc" }],
            },
          },
        },
        stageHistory: {
          where: { companyId: this.companyId },
          select: { toStageId: true, enteredAt: true, exitedAt: true, durationSeconds: true },
          orderBy: [{ enteredAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!deal) return null;

    return summarizeDealStageDurations({
      deal,
      stages: deal.pipeline?.stages ?? [],
      history: deal.stageHistory,
      now,
    });
  }
}
