export abstract class FindDealPipelinesRepo {
  abstract findPipelineIdsByDealIds(ids: Set<string>): Promise<Map<string, string>>;
}
