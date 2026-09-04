import { type PipelineDto } from "../pipeline.schema";

export abstract class ReorderStagesRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<PipelineDto>;
  abstract reorderStagesOrThrow(pipelineId: string, stageIds: string[]): Promise<PipelineDto>;
}
