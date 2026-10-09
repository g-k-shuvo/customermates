import { type DealStatus } from "@/generated/prisma";

export abstract class FindDealPipelinesRepo {
  abstract findPipelineIdsByDealIds(ids: Set<string>): Promise<Map<string, string>>;
  abstract findStatusAndStageByDealIds(
    ids: Set<string>,
  ): Promise<Map<string, { status: DealStatus; stageId: string | null }>>;
}
