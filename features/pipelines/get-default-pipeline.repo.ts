export abstract class GetDefaultPipelineRepo {
  abstract getDefaultPipelineWithFirstStage(): Promise<{ pipelineId: string; stageId: string } | null>;
}
