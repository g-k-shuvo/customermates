import { type LeadDto } from "../lead.schema";

export type MarkLeadConvertedArgs = {
  id: string;
  dealId: string;
  convertedAt: Date;
};

export abstract class ConvertLeadToDealRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<LeadDto>;
  abstract markLeadConvertedOrThrow(args: MarkLeadConvertedArgs): Promise<LeadDto>;
}
