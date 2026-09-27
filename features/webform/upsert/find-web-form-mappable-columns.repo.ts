export abstract class FindWebFormMappableColumnsRepo {
  abstract findMappableColumnIds(ids: Set<string>): Promise<Set<string>>;
}
