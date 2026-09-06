import { type NextActivityDto } from "./task.schema";

export abstract class FindNextActivitiesRepo {
  abstract findNextActivitiesByDealIds(dealIds: Set<string>): Promise<Map<string, NextActivityDto>>;
}
