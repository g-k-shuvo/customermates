"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteLeadData } from "@/features/leads/delete/delete-lead.interactor";
import type { GetLeadByIdData } from "@/features/leads/get/get-lead-by-id.interactor";
import type { CreateLeadData } from "@/features/leads/upsert/create-lead.interactor";
import type { UpdateLeadData } from "@/features/leads/upsert/update-lead.interactor";

import {
  getGetLeadsInteractor,
  getGetLeadByIdInteractor,
  getCreateLeadInteractor,
  getUpdateLeadInteractor,
  getDeleteLeadInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getLeadsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetLeadsInteractor().invoke(params));
}

export async function createLeadAction(data: CreateLeadData) {
  return serializeResult(getCreateLeadInteractor().invoke(data));
}

export async function updateLeadAction(data: UpdateLeadData) {
  return serializeResult(getUpdateLeadInteractor().invoke(data));
}

export async function deleteLeadAction(data: DeleteLeadData) {
  return serializeResult(getDeleteLeadInteractor().invoke(data));
}

export async function getLeadByIdAction(data: GetLeadByIdData) {
  const result = await unwrapValidated(getGetLeadByIdInteractor().invoke(data));
  return { entity: result.lead, customColumns: result.customColumns };
}
