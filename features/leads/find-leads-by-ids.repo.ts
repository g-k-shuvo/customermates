export abstract class FindLeadsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
