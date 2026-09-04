export abstract class FindPipelinesByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
