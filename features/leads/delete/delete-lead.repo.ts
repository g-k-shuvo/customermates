import { type LeadDto } from "../lead.schema";

export abstract class DeleteLeadRepo {
  abstract deleteLeadOrThrow(id: string): Promise<string>;
  abstract getOrThrowCompanyWide(id: string): Promise<LeadDto>;
}
