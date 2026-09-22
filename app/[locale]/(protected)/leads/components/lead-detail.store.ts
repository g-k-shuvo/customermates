import type { CreateLeadData } from "@/features/leads/upsert/create-lead.interactor";
import type { LeadDto } from "@/features/leads/lead.schema";
import type { RootStore } from "@/core/stores/root.store";

import { LeadStatus, Resource } from "@/generated/prisma";

import { createLeadAction, deleteLeadAction, getLeadByIdAction, updateLeadAction } from "../actions";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class LeadDetailStore extends BaseCustomColumnEntityModalStore<CreateLeadData & { id?: string }, LeadDto> {
  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        title: "",
        status: LeadStatus.new,
        sourceOrigin: "manual",
        labels: [],
        notes: null,
        customFieldValues: [],
      },
      Resource.leads,
      rootStore.leadsStore,
      {
        getById: getLeadByIdAction,
        create: createLeadAction,
        update: updateLeadAction,
        delete: deleteLeadAction,
      },
    );
  }

  protected initFormWithCustomFieldValues(entity?: LeadDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        contactId: entity.contact?.id,
        organizationId: entity.organization?.id,
        ownerUserId: entity.owner?.id,
        value: entity.value ?? undefined,
      };
    }

    return {
      ...baseData,
      title: "",
      status: LeadStatus.new,
      sourceOrigin: "manual",
      labels: [],
      notes: null,
    };
  }
}
