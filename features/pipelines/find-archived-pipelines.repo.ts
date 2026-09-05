export abstract class FindArchivedPipelinesRepo {
  abstract findArchivedIds(ids: Set<string>): Promise<Set<string>>;
}
