"use server";

import type { AudienceDefinition } from "@/features/audience/audience.schema";
import type {
  CreateCampaignData,
  GetCampaignRecipientsData,
  UpdateCampaignData,
} from "@/features/campaigns/campaign.schema";

import { EntityType, Status } from "@/generated/prisma";

import {
  getCancelCampaignInteractor,
  getCreateCampaignInteractor,
  getDeleteCampaignInteractor,
  getGetCampaignInteractor,
  getGetCampaignRecipientsInteractor,
  getGetCampaignsInteractor,
  getGetContactListsInteractor,
  getGetCustomColumnsInteractor,
  getGetUsersApiInteractor,
  getPreviewAudienceInteractor,
  getStartCampaignInteractor,
  getUpdateCampaignInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getCampaignsAction() {
  return await serializeResult(getGetCampaignsInteractor().invoke());
}

export async function getCampaignAction(id: string) {
  return await serializeResult(getGetCampaignInteractor().invoke({ id }));
}

export async function createCampaignAction(data: CreateCampaignData) {
  return await serializeResult(getCreateCampaignInteractor().invoke(data));
}

export async function updateCampaignAction(data: UpdateCampaignData) {
  return await serializeResult(getUpdateCampaignInteractor().invoke(data));
}

export async function deleteCampaignAction(id: string) {
  return await serializeResult(getDeleteCampaignInteractor().invoke({ id }));
}

export async function sendCampaignAction(id: string) {
  return await serializeResult(getStartCampaignInteractor().invoke({ id }));
}

export async function cancelCampaignAction(id: string) {
  return await serializeResult(getCancelCampaignInteractor().invoke({ id }));
}

export async function getCampaignRecipientsAction(data: GetCampaignRecipientsData) {
  return await serializeResult(getGetCampaignRecipientsInteractor().invoke(data));
}

export async function previewAudienceAction(data: AudienceDefinition) {
  return await serializeResult(getPreviewAudienceInteractor().invoke(data));
}

export async function getCampaignOptionsAction() {
  const [lists, columns, users] = await Promise.all([
    getGetContactListsInteractor().invoke(),
    getGetCustomColumnsInteractor().invoke(),
    getGetUsersApiInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }),
  ]);
  const writable = columns.ok ? columns.data : [];

  return {
    lists: lists.ok ? lists.data.map((list) => ({ id: list.id, name: list.name, memberCount: list.memberCount })) : [],
    contactColumns: writable.filter((column) => column.entityType === EntityType.contact),
    organizationColumns: writable.filter((column) => column.entityType === EntityType.organization),
    users: users.ok
      ? users.data.items
          .filter((user) => user.status === Status.active)
          .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() || user.email }))
      : [],
  };
}
