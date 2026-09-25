"use server";

import type { UpsertAutomationData } from "@/features/automation/upsert/upsert-automation.interactor";
import type { DeleteAutomationData } from "@/features/automation/delete/delete-automation.interactor";

import { getDeleteAutomationInteractor, getGetAutomationsInteractor, getUpsertAutomationInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getAutomationsAction() {
  return unwrapValidated(getGetAutomationsInteractor().invoke());
}

export async function upsertAutomationAction(data: UpsertAutomationData) {
  return await serializeResult(getUpsertAutomationInteractor().invoke(data));
}

export async function deleteAutomationAction(data: DeleteAutomationData) {
  return await serializeResult(getDeleteAutomationInteractor().invoke(data));
}
