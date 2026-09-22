import { type LeadDto } from "../lead.schema";

import { type CreateLeadData } from "./create-lead.interactor";

export abstract class CreateLeadRepo {
  abstract createLeadOrThrow(args: CreateLeadData): Promise<LeadDto>;
}
