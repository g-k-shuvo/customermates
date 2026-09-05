"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteDealData } from "@/features/deals/delete/delete-deal.interactor";
import type { GetDealByIdData } from "@/features/deals/get/get-deal-by-id.interactor";
import type { CreateDealData } from "@/features/deals/upsert/create-deal.interactor";
import type { UpdateDealData } from "@/features/deals/upsert/update-deal.interactor";
import type { MarkDealWonData } from "@/features/deals/close/mark-deal-won.interactor";
import type { MarkDealLostData } from "@/features/deals/close/mark-deal-lost.interactor";
import type { ReopenDealData } from "@/features/deals/close/reopen-deal.interactor";

import {
  getGetDealsInteractor,
  getGetDealByIdInteractor,
  getCreateDealInteractor,
  getUpdateDealInteractor,
  getDeleteDealInteractor,
  getMarkDealWonInteractor,
  getMarkDealLostInteractor,
  getReopenDealInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getDealsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetDealsInteractor().invoke(params));
}

export async function createDealAction(data: CreateDealData) {
  return serializeResult(getCreateDealInteractor().invoke(data));
}

export async function updateDealAction(data: UpdateDealData) {
  return serializeResult(getUpdateDealInteractor().invoke(data));
}

export async function deleteDealAction(data: DeleteDealData) {
  return serializeResult(getDeleteDealInteractor().invoke(data));
}

export async function markDealWonAction(data: MarkDealWonData) {
  return serializeResult(getMarkDealWonInteractor().invoke(data));
}

export async function markDealLostAction(data: MarkDealLostData) {
  return serializeResult(getMarkDealLostInteractor().invoke(data));
}

export async function reopenDealAction(data: ReopenDealData) {
  return serializeResult(getReopenDealInteractor().invoke(data));
}

export async function getDealByIdAction(data: GetDealByIdData) {
  const result = await unwrapValidated(getGetDealByIdInteractor().invoke(data));
  return { entity: result.deal, customColumns: result.customColumns };
}

export async function createDealByNameAction(name: string, userId: string | null | undefined) {
  const result = await createDealAction({
    name,
    notes: null,
    organizationIds: [],
    userIds: userId ? [userId] : [],
    contactIds: [],
    services: [],
    taskIds: [],
    customFieldValues: [],
  });

  return result;
}
