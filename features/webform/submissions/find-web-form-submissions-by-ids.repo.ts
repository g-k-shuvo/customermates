export abstract class FindWebFormSubmissionsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
