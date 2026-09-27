import type { DealStageDurationsDto } from "../deal-stage-durations.schema";

export abstract class GetDealStageDurationsRepo {
  abstract getDealStageDurations(id: string, now: Date): Promise<DealStageDurationsDto | null>;
}
