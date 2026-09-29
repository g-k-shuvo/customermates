"use server";

import type {
  ChangeContactListMembersData,
  CreateContactListData,
  FillContactListData,
  GetContactListMembersData,
  UpdateContactListData,
} from "@/features/contact-lists/contact-list.schema";

import {
  getCreateContactListInteractor,
  getDeleteContactListInteractor,
  getFillContactListInteractor,
  getGetBulkJobInteractor,
  getGetContactListMembersInteractor,
  getGetContactListsInteractor,
  getGetCustomColumnsInteractor,
  getGetWidgetFilterableFieldsInteractor,
  getRemoveContactListMembersInteractor,
  getUpdateContactListInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getContactListsAction() {
  return await serializeResult(getGetContactListsInteractor().invoke());
}

export async function createContactListAction(data: CreateContactListData) {
  return await serializeResult(getCreateContactListInteractor().invoke(data));
}

export async function updateContactListAction(data: UpdateContactListData) {
  return await serializeResult(getUpdateContactListInteractor().invoke(data));
}

export async function deleteContactListAction(id: string) {
  return await serializeResult(getDeleteContactListInteractor().invoke({ id }));
}

export async function getContactListMembersAction(data: GetContactListMembersData) {
  return await serializeResult(getGetContactListMembersInteractor().invoke(data));
}

export async function removeContactListMembersAction(data: ChangeContactListMembersData) {
  return await serializeResult(getRemoveContactListMembersInteractor().invoke(data));
}

export async function fillContactListAction(data: FillContactListData) {
  return await serializeResult(getFillContactListInteractor().invoke(data));
}

export async function getBulkJobAction(id: string) {
  return await serializeResult(getGetBulkJobInteractor().invoke({ id }));
}

export async function getContactFilterFieldsAction() {
  const [filterableFields, customColumns] = await Promise.all([
    unwrapValidated(getGetWidgetFilterableFieldsInteractor().invoke()),
    unwrapValidated(getGetCustomColumnsInteractor().invoke()),
  ]);

  return {
    filterableFields: filterableFields.chart.contact ?? [],
    customColumns: customColumns.filter((column) => column.entityType === "contact"),
  };
}
