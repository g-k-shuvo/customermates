"use server";

import type {
  GetDuplicateGroupsData,
  MergeContactsData,
  MergeOrganizationsData,
  StartDuplicateScanData,
} from "@/features/duplicates/duplicate.schema";

import {
  getDismissDuplicateGroupInteractor,
  getGetContactMergesInteractor,
  getGetOrganizationMergesInteractor,
  getGetDuplicateGroupsInteractor,
  getMergeContactsInteractor,
  getMergeOrganizationsInteractor,
  getStartDuplicateScanInteractor,
  getUndoContactMergeInteractor,
  getUndoOrganizationMergeInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getDuplicateGroupsAction(data: GetDuplicateGroupsData) {
  return serializeResult(getGetDuplicateGroupsInteractor().invoke(data));
}

export async function startDuplicateScanAction(data: StartDuplicateScanData) {
  return serializeResult(getStartDuplicateScanInteractor().invoke(data));
}

export async function dismissDuplicateGroupAction(id: string) {
  return serializeResult(getDismissDuplicateGroupInteractor().invoke({ id }));
}

export async function mergeContactsAction(data: MergeContactsData) {
  return serializeResult(getMergeContactsInteractor().invoke(data));
}

export async function undoContactMergeAction(id: string) {
  return serializeResult(getUndoContactMergeInteractor().invoke({ id }));
}

export async function getContactMergesAction() {
  return serializeResult(getGetContactMergesInteractor().invoke());
}

export async function mergeOrganizationsAction(data: MergeOrganizationsData) {
  return serializeResult(getMergeOrganizationsInteractor().invoke(data));
}

export async function undoOrganizationMergeAction(id: string) {
  return serializeResult(getUndoOrganizationMergeInteractor().invoke({ id }));
}

export async function getOrganizationMergesAction() {
  return serializeResult(getGetOrganizationMergesInteractor().invoke());
}
