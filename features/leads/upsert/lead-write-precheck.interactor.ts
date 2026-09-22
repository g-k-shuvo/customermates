import type { z } from "zod";

import type { ValidateAssigneeGuardInteractor } from "@/core/validation/validators/validate-assignee-guard.interactor";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateCustomFieldValuesInteractor } from "@/core/validation/validators/validate-custom-field-values.interactor";
import type { ValidateLeadIdsInteractor } from "@/core/validation/validators/validate-lead-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateUserIdsInteractor } from "@/core/validation/validators/validate-user-ids.interactor";
import type { CreateLeadData } from "./create-lead.interactor";
import type { UpdateLeadData } from "./update-lead.interactor";
import type { CreateManyLeadsData } from "./create-many-leads.interactor";
import type { UpdateManyLeadsData } from "./update-many-leads.interactor";
import type { DeleteLeadData } from "../delete/delete-lead.interactor";

import { Resource, EntityType } from "@/generated/prisma";

export class LeadWritePrecheckInteractor {
  constructor(
    private leadValidator: ValidateLeadIdsInteractor,
    private contactValidator: ValidateContactIdsInteractor,
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private userValidator: ValidateUserIdsInteractor,
    private customFieldValuesValidator: ValidateCustomFieldValuesInteractor,
    private assigneeGuardValidator: ValidateAssigneeGuardInteractor,
  ) {}

  async create(data: CreateLeadData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.contactValidator.invoke([{ ids: data.contactId, path: ["contactId"] }], ctx),
      this.organizationValidator.invoke([{ ids: data.organizationId, path: ["organizationId"] }], ctx),
      this.userValidator.invoke([{ ids: data.ownerUserId, path: ["ownerUserId"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.lead,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        [{ userIds: data.ownerUserId ? [data.ownerUserId] : [], path: ["ownerUserId"] }],
        Resource.leads,
        ctx,
      ),
    ]);
  }

  async update(data: UpdateLeadData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.leadValidator.invoke([{ ids: data.id, path: ["id"] }], ctx),
      this.contactValidator.invoke([{ ids: data.contactId, path: ["contactId"] }], ctx),
      this.organizationValidator.invoke([{ ids: data.organizationId, path: ["organizationId"] }], ctx),
      this.userValidator.invoke([{ ids: data.ownerUserId, path: ["ownerUserId"] }], ctx),
      this.customFieldValuesValidator.invoke(
        [{ values: data.customFieldValues, path: ["customFieldValues"] }],
        EntityType.lead,
        ctx,
      ),
    ]);
  }

  async delete(data: DeleteLeadData, ctx: z.RefinementCtx) {
    await this.leadValidator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }

  async createMany(data: CreateManyLeadsData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.contactValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.contactId, path: ["leads", i, "contactId"] })),
        ctx,
      ),
      this.organizationValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.organizationId, path: ["leads", i, "organizationId"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.ownerUserId, path: ["leads", i, "ownerUserId"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.leads.map((lead, i) => ({ values: lead.customFieldValues, path: ["leads", i, "customFieldValues"] })),
        EntityType.lead,
        ctx,
      ),
      this.assigneeGuardValidator.invoke(
        data.leads.map((lead, i) => ({
          userIds: lead.ownerUserId ? [lead.ownerUserId] : [],
          path: ["leads", i, "ownerUserId"],
        })),
        Resource.leads,
        ctx,
      ),
    ]);
  }

  async updateMany(data: UpdateManyLeadsData, ctx: z.RefinementCtx) {
    await Promise.all([
      this.leadValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.id, path: ["leads", i, "id"] })),
        ctx,
      ),
      this.contactValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.contactId, path: ["leads", i, "contactId"] })),
        ctx,
      ),
      this.organizationValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.organizationId, path: ["leads", i, "organizationId"] })),
        ctx,
      ),
      this.userValidator.invoke(
        data.leads.map((lead, i) => ({ ids: lead.ownerUserId, path: ["leads", i, "ownerUserId"] })),
        ctx,
      ),
      this.customFieldValuesValidator.invoke(
        data.leads.map((lead, i) => ({ values: lead.customFieldValues, path: ["leads", i, "customFieldValues"] })),
        EntityType.lead,
        ctx,
      ),
    ]);
  }
}
