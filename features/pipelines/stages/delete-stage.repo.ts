import { type PipelineStageDto } from "../pipeline.schema";

export abstract class DeleteStageRepo {
  abstract countStagesInPipeline(pipelineId: string): Promise<number>;
  abstract countDealsInStage(stageId: string): Promise<number>;
  abstract moveDealsToStage(fromStageId: string, toStageId: string): Promise<number>;
  abstract deleteStageOrThrow(id: string): Promise<PipelineStageDto>;
}
