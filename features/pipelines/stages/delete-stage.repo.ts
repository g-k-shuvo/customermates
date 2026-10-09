import { type StageKind } from "@/generated/prisma";
import { type DealDto } from "@/features/deals/deal.schema";

import { type PipelineStageDto } from "../pipeline.schema";

export abstract class DeleteStageRepo {
  abstract countStagesInPipeline(pipelineId: string): Promise<number>;
  abstract countDealsInStage(stageId: string): Promise<number>;
  abstract findStageKinds(ids: string[]): Promise<Map<string, StageKind>>;
  abstract countOtherStagesOfSameKind(stageId: string): Promise<number>;
  abstract moveDealsToStage(fromStageId: string, toStageId: string): Promise<{ before: DealDto; after: DealDto }[]>;
  abstract deleteStageOrThrow(id: string): Promise<PipelineStageDto>;
}
