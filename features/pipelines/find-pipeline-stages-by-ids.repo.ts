export abstract class FindPipelineStagesByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
