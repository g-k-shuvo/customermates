export abstract class FindStagePipelineRepo {
  abstract findPipelineIdsByStageIds(ids: Set<string>): Promise<Map<string, string>>;
}
