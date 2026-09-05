import { type DealDto } from "../deal.schema";

export type MarkDealLostArgs = {
  id: string;
  lostReasonId: string;
  lostNotes?: string | null;
};

export abstract class MarkDealLostRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
  abstract markDealLostOrThrow(args: MarkDealLostArgs): Promise<DealDto | null>;
}
