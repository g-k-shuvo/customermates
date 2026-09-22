export abstract class FindWebFormSourcesByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
