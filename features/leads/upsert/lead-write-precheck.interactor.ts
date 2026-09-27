import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateLeadIdsInteractor } from "@/core/validation/validators/validate-lead-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { ValidateWebFormSourceIdsInteractor } from "@/core/validation/validators/validate-web-form-source-ids.interactor";
import type { DealWritePrecheckInteractor } from "@/features/deals/upsert/deal-write-precheck.interactor";
import type { FindLeadRelationsRepo, LeadRelations } from "../find-lead-relations.repo";
import type { CreateLeadData } from "./create-lead.interactor";
import type { UpdateLeadData } from "./update-lead.interactor";
import type { CreateManyLeadsData } from "./create-many-leads.interactor";
import type { UpdateManyLeadsData } from "./update-many-leads.interactor";
import type { DeleteLeadData } from "../delete/delete-lead.interactor";
import type { ConvertLeadToDealData } from "../convert/convert-lead-to-deal.interactor";

import { Resource, EntityType } from "@/generated/prisma";

type Path = (string | number)[];

type RelationEntry = {
  lead: { [Field in keyof LeadRelations]?: string | null };
  stored?: LeadRelations;
  path: Path;
};

function changedId(requested: string | null | undefined, stored: string | null | undefined) {
  return requested === stored ? undefined : requested;
}

function assignees(ownerUserId: string | null | undefined) {
  return ownerUserId ? [ownerUserId] : [];
}

function reassignees(ownerUserId: string | null | undefined) {
  return ownerUserId === undefined ? undefined : assignees(ownerUserId);
}

export class LeadWritePrecheckInteractor {
  constructor(
    private leadValidator: ValidateLeadIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
    private sourceValidator: ValidateWebFormSourceIdsInteractor,
    private relationsRepo: FindLeadRelationsRepo,
    private dealPrecheck: DealWritePrecheckInteractor,
  ) {}

  async create(data: CreateLeadData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.checkRelations([{ lead: data, path: [] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.lead,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        [{ userIds: assignees(data.ownerUserId), path: ["ownerUserId"] }],
        Resource.leads,
        ctx,
      ),
    ]);
  }

  async update(data: UpdateLeadData, ctx: z.RefinementCtx) {
    const stored = await this.relationsRepo.findRelationsByLeadIds(new Set([data.id]));

    await Promise.all([
      this.leadValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.checkRelations([{ lead: data, stored: stored.get(data.id), path: [] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.lead,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        [{ userIds: reassignees(data.ownerUserId), path: ["ownerUserId"] }],
        Resource.leads,
        ctx,
      ),
    ]);
  }

  async delete(data: DeleteLeadData, ctx: z.RefinementCtx) {
    await this.leadValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async convert(data: ConvertLeadToDealData, ctx: z.RefinementCtx) {
    const stored = await this.relationsRepo.findRelationsByLeadIds(new Set([data.id]));
    const lead = stored.get(data.id);

    await Promise.all([
      this.leadValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.dealPrecheck.placement(data, ctx),
      this.assigneeGuardValidator.invoke(
        [{ userIds: lead ? assignees(lead.ownerUserId) : undefined, path: ["ownerUserId"] }],
        Resource.deals,
        ctx,
      ),
    ]);
  }

  async createMany(data: CreateManyLeadsData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.checkRelations(
        data.leads.map((lead, i) => ({ lead, path: ["leads", i] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.leads.map((lead, i) => ({ values: lead.customFieldValues, path: ["leads", i, "customFieldValues"] })),
        EntityType.lead,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.leads.map((lead, i) => ({ userIds: assignees(lead.ownerUserId), path: ["leads", i, "ownerUserId"] })),
        Resource.leads,
        ctx,
      ),
    ]);
  }

  async updateMany(data: UpdateManyLeadsData, ctx: z.RefinementCtx) {
    const stored = await this.relationsRepo.findRelationsByLeadIds(new Set(data.leads.map((lead) => lead.id)));

    await Promise.all([
      this.leadValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.id, path: ["leads", i, "id"] })),
        ctx,
      ),
      this.checkRelations(
        data.leads.map((lead, i) => ({ lead, stored: stored.get(lead.id), path: ["leads", i] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.leads.map((lead, i) => ({ values: lead.customFieldValues, path: ["leads", i, "customFieldValues"] })),
        EntityType.lead,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.leads.map((lead, i) => ({ userIds: reassignees(lead.ownerUserId), path: ["leads", i, "ownerUserId"] })),
        Resource.leads,
        ctx,
      ),
    ]);
  }

  private async checkRelations(entries: RelationEntry[], ctx: z.RefinementCtx) {
    const requested = (field: keyof LeadRelations) =>
      entries.map(({ lead, stored, path }) => ({
        ids: changedId(lead[field], stored?.[field]),
        path: [...path, field],
      }));

    await Promise.all([
      this.contactValidator.invoke(requested("contactId"), ctx),
      this.organizationValidator.invoke(requested("organizationId"), ctx),
      this.userValidator.invoke(requested("ownerUserId"), ctx),
      this.sourceValidator.invoke(requested("sourceId"), ctx),
    ]);
  }
}
