import { type DealDto } from "../deal.schema";

export type ReopenDealArgs = {
  id: string;
  stageId?: string | null;
};

export abstract class ReopenDealRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
  abstract reopenDealOrThrow(args: ReopenDealArgs): Promise<DealDto | null>;
}
