import { type PipelineDto } from "../pipeline.schema";

export abstract class DeletePipelineRepo {
  abstract deletePipelineOrThrow(id: string): Promise<PipelineDto>;
  abstract getOrThrowCompanyWide(id: string): Promise<PipelineDto>;
  abstract countDealsInPipeline(pipelineId: string): Promise<number>;
}
