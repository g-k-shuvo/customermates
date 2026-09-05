export abstract class GetDefaultPipelineRepo {
  abstract getDefaultPipelineWithFirstStage(): Promise<{ pipelineId: string; stageId: string } | null>;
  abstract getFirstStageOfPipeline(pipelineId: string): Promise<string | null>;
}
