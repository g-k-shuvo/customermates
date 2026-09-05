import { type DealDto } from "../deal.schema";

export abstract class MarkDealWonRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
  abstract markDealWonOrThrow(id: string): Promise<DealDto | null>;
}
