export abstract class FindLostReasonsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
