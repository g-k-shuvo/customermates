import type { LeadAssigner } from "./lead-assigner";
import type { LeadDto } from "@/features/leads/lead.schema";

export type AssignedLeadReader = { findLeadForEventOrThrowUnscoped(leadId: string): Promise<LeadDto> };

export class NewLeadAssignment {
  constructor(
    private assigner: LeadAssigner,
    private leads: AssignedLeadReader,
  ) {}

  async apply(companyId: string, lead: LeadDto): Promise<LeadDto> {
    if (lead.owner) return lead;

    const assigned = await this.assigner.assign(companyId, lead.id);

    return assigned ? await this.leads.findLeadForEventOrThrowUnscoped(lead.id) : lead;
  }

  async companyActor(companyId: string): Promise<string | null> {
    return await this.assigner.companyActor(companyId);
  }
}
