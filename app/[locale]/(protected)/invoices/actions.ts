"use server";

import type {
  CreateInvoiceData,
  DeleteInvoicePaymentData,
  GetInvoicesData,
  IssueInvoiceData,
  RecordInvoicePaymentData,
  UpdateInvoiceData,
  UpdateInvoiceSettingsData,
  UpsertBillingProfileData,
} from "@/features/invoices/invoice.schema";

import {
  getCreateInvoiceInteractor,
  getDeleteInvoiceInteractor,
  getDeleteInvoicePaymentInteractor,
  getGetBillingProfileInteractor,
  getGetInvoiceInteractor,
  getGetInvoicesInteractor,
  getIssueInvoiceInteractor,
  getRecordInvoicePaymentInteractor,
  getUpdateInvoiceInteractor,
  getUpdateInvoiceSettingsInteractor,
  getUpsertBillingProfileInteractor,
  getVoidInvoiceInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getInvoicesAction(data: GetInvoicesData) {
  return serializeResult(getGetInvoicesInteractor().invoke(data));
}

export async function getInvoiceAction(id: string) {
  return serializeResult(getGetInvoiceInteractor().invoke({ id }));
}

export async function createInvoiceAction(data: CreateInvoiceData) {
  return serializeResult(getCreateInvoiceInteractor().invoke(data));
}

export async function updateInvoiceAction(data: UpdateInvoiceData) {
  return serializeResult(getUpdateInvoiceInteractor().invoke(data));
}

export async function deleteInvoiceAction(id: string) {
  return serializeResult(getDeleteInvoiceInteractor().invoke({ id }));
}

export async function issueInvoiceAction(data: IssueInvoiceData) {
  return serializeResult(getIssueInvoiceInteractor().invoke(data));
}

export async function recordInvoicePaymentAction(data: RecordInvoicePaymentData) {
  return serializeResult(getRecordInvoicePaymentInteractor().invoke(data));
}

export async function deleteInvoicePaymentAction(data: DeleteInvoicePaymentData) {
  return serializeResult(getDeleteInvoicePaymentInteractor().invoke(data));
}

export async function voidInvoiceAction(id: string) {
  return serializeResult(getVoidInvoiceInteractor().invoke({ id }));
}

export async function updateInvoiceSettingsAction(data: UpdateInvoiceSettingsData) {
  return serializeResult(getUpdateInvoiceSettingsInteractor().invoke(data));
}

export async function getBillingProfileAction(organizationId: string) {
  return serializeResult(getGetBillingProfileInteractor().invoke({ organizationId }));
}

export async function upsertBillingProfileAction(data: UpsertBillingProfileData) {
  return serializeResult(getUpsertBillingProfileInteractor().invoke(data));
}
