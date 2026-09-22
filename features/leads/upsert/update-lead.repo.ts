import { type LeadDto } from "../lead.schema";

import { type UpdateLeadData } from "./update-lead.interactor";

export abstract class UpdateLeadRepo {
  abstract updateLeadOrThrow(args: UpdateLeadData): Promise<LeadDto>;
  abstract getOrThrowCompanyWide(id: string): Promise<LeadDto>;
}
