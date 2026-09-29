"use server";

import type {
  AddSuppressionData,
  GetSuppressionsData,
} from "@/features/messaging-send/suppression/manage-suppressions.interactor";

import type { SaveSenderIdentityData } from "@/features/messaging-send/sender/sender-identity.interactor";

import {
  getAddSuppressionInteractor,
  getGetSenderIdentityInteractor,
  getGetSuppressionsInteractor,
  getRemoveSuppressionInteractor,
  getSaveSenderIdentityInteractor,
  getVerifySenderDomainInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getSuppressionsAction(data: GetSuppressionsData) {
  return serializeResult(getGetSuppressionsInteractor().invoke(data));
}

export async function addSuppressionAction(data: AddSuppressionData) {
  return serializeResult(getAddSuppressionInteractor().invoke(data));
}

export async function removeSuppressionAction(id: string) {
  return serializeResult(getRemoveSuppressionInteractor().invoke({ id }));
}

export async function getSenderIdentityAction() {
  return serializeResult(getGetSenderIdentityInteractor().invoke());
}

export async function saveSenderIdentityAction(data: SaveSenderIdentityData) {
  return serializeResult(getSaveSenderIdentityInteractor().invoke(data));
}

export async function verifySenderDomainAction() {
  return serializeResult(getVerifySenderDomainInteractor().invoke({}));
}
