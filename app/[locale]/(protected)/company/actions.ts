"use server";

import type { AdminUpdateUserDetailsData } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { GetUserByIdData } from "@/features/user/get/get-user-by-id.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { SendFeedbackData } from "@/features/feedback/send-feedback.schema";
import type { UpdateCompanySettingsData } from "@/features/company/update-company-settings.interactor";
import type { DeleteRoleData } from "@/features/role/delete-role.interactor";
import type { UpsertRoleData } from "@/features/role/upsert-role.interactor";
import type { UpsertWebhookData } from "@/features/webhook/upsert-webhook.interactor";
import type { CreateWebFormSourceData } from "@/features/webform/upsert/create-web-form-source.interactor";
import type { UpdateWebFormSourceData } from "@/features/webform/upsert/update-web-form-source.interactor";
import type { DeleteWebFormSourceData } from "@/features/webform/delete/delete-web-form-source.interactor";
import type { RotateWebFormSecretData } from "@/features/webform/upsert/rotate-web-form-secret.interactor";
import type { DeleteWebhookData } from "@/features/webhook/delete-webhook.interactor";
import type { ResendWebhookDeliveryData } from "@/features/webhook/resend-webhook-delivery.interactor";
import type { InviteUsersByEmailData } from "@/features/company/invite-users-by-email.interactor";
import type { CreateCheckoutSessionData } from "@/ee/subscription/create-checkout-session.interactor";
import type { UpdateStageData } from "@/features/pipelines/stages/update-stage.interactor";
import type { CreateStageData } from "@/features/pipelines/stages/create-stage.interactor";
import type { DeleteStageData } from "@/features/pipelines/stages/delete-stage.interactor";
import type { CreatePipelineData } from "@/features/pipelines/upsert/create-pipeline.interactor";
import type { UpdatePipelineData } from "@/features/pipelines/upsert/update-pipeline.interactor";
import type { ReorderStagesData } from "@/features/pipelines/upsert/reorder-stages.interactor";
import type { DeletePipelineData } from "@/features/pipelines/delete/delete-pipeline.interactor";
import type { CreateLostReasonData } from "@/features/lost-reasons/upsert/create-lost-reason.interactor";
import type { UpdateLostReasonData } from "@/features/lost-reasons/upsert/update-lost-reason.interactor";
import type { DeleteLostReasonData } from "@/features/lost-reasons/delete/delete-lost-reason.interactor";

import { z } from "zod";

import { STAGE_GROUPING_KEY } from "@/core/base/base-get.schema";

import {
  getGetDealsInteractor,
  getGetPipelinesInteractor,
  getCreatePipelineInteractor,
  getUpdatePipelineInteractor,
  getDeletePipelineInteractor,
  getReorderStagesInteractor,
  getCreateStageInteractor,
  getUpdateStageInteractor,
  getDeleteStageInteractor,
  getGetLostReasonsInteractor,
  getCreateLostReasonInteractor,
  getUpdateLostReasonInteractor,
  getDeleteLostReasonInteractor,
  getGetUsersInteractor,
  getGetUserByIdInteractor,
  getAdminUpdateUserDetailsInteractor,
  getGetCompanySettingsInteractor,
  getUpdateCompanySettingsInteractor,
  getGetOrCreateInviteTokenInteractor,
  getInviteUsersByEmailInteractor,
  getSendFeedbackInteractor,
  getGetRolesInteractor,
  getUpsertRoleInteractor,
  getDeleteRoleInteractor,
  getCreateCheckoutSessionInteractor,
  getRefreshSubscriptionInteractor,
  getGetSubscriptionInteractor,
  getGetBillingPortalUrlInteractor,
  getGetWebhooksInteractor,
  getUpsertWebhookInteractor,
  getGetWebFormSourcesInteractor,
  getCreateWebFormSourceInteractor,
  getUpdateWebFormSourceInteractor,
  getDeleteWebFormSourceInteractor,
  getRotateWebFormSecretInteractor,
  getDeleteWebhookInteractor,
  getGetWebhookDeliveriesInteractor,
  getResendWebhookDeliveryInteractor,
  getGetAuditLogsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { isRedirect } from "@/features/auth/auth-outcome";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { stageDeletionConflict } from "@/features/pipelines/stage-deletion-conflict";

export async function createCheckoutSessionAction(data: CreateCheckoutSessionData) {
  const result = await getCreateCheckoutSessionInteractor().invoke(data);
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  return { ok: false as const, error: z.treeifyError(result.error) };
}

export async function refreshSubscriptionAction() {
  return serializeResult(getRefreshSubscriptionInteractor().invoke());
}

export async function getSubscriptionAction() {
  const result = await getGetSubscriptionInteractor().invoke();
  return result.data;
}

export async function getBillingPortalUrlAction() {
  const result = await getGetBillingPortalUrlInteractor().invoke();
  if (isRedirect(result)) return { ok: true as const, data: { url: result.redirect } };
  return { ok: false as const, error: z.treeifyError(result.error) };
}

export async function updateCompanyAction(data: UpdateCompanySettingsData) {
  return serializeResult(getUpdateCompanySettingsInteractor().invoke(data));
}

export async function getDealStageValueSumsAction() {
  const result = await getGetDealsInteractor().invoke({
    groupedPagination: { groupingColumnId: STAGE_GROUPING_KEY, perGroup: 1 },
  });

  if (!result.ok) return { ok: false as const, error: z.treeifyError(result.error) };

  return { ok: true as const, data: result.data.groupValueSums ?? {} };
}

export async function getPipelinesAction() {
  return unwrapValidated(getGetPipelinesInteractor().invoke());
}

export async function createPipelineAction(data: CreatePipelineData) {
  return serializeResult(getCreatePipelineInteractor().invoke(data));
}

export async function updatePipelineAction(data: UpdatePipelineData) {
  return serializeResult(getUpdatePipelineInteractor().invoke(data));
}

export async function deletePipelineAction(data: DeletePipelineData) {
  return serializeResult(getDeletePipelineInteractor().invoke(data));
}

export async function getLostReasonsAction() {
  return unwrapValidated(getGetLostReasonsInteractor().invoke());
}

export async function createLostReasonAction(data: CreateLostReasonData) {
  return serializeResult(getCreateLostReasonInteractor().invoke(data));
}

export async function updateLostReasonAction(data: UpdateLostReasonData) {
  return serializeResult(getUpdateLostReasonInteractor().invoke(data));
}

export async function deleteLostReasonAction(data: DeleteLostReasonData) {
  return serializeResult(getDeleteLostReasonInteractor().invoke(data));
}

export async function reorderStagesAction(data: ReorderStagesData) {
  return serializeResult(getReorderStagesInteractor().invoke(data));
}

export async function createStageAction(data: CreateStageData) {
  return serializeResult(getCreateStageInteractor().invoke(data));
}

export async function updateStageAction(data: UpdateStageData) {
  return serializeResult(getUpdateStageInteractor().invoke(data));
}

export async function deleteStageAction(data: DeleteStageData) {
  const result = await getDeleteStageInteractor().invoke(data);
  if (result.ok) return { ok: true as const, data: result.data };

  return {
    ok: false as const,
    error: z.treeifyError(result.error),
    conflict: stageDeletionConflict(result.error),
  };
}

export async function sendFeedbackAction(data: SendFeedbackData) {
  return serializeResult(getSendFeedbackInteractor().invoke(data));
}

export async function adminUpdateUserDetailsAction(data: AdminUpdateUserDetailsData) {
  return serializeResult(getAdminUpdateUserDetailsInteractor().invoke(data));
}

export async function getOrCreateInviteTokenAction() {
  const result = await getGetOrCreateInviteTokenInteractor().invoke();
  return result.data;
}

export async function inviteUsersByEmailAction(data: InviteUsersByEmailData) {
  return serializeResult(getInviteUsersByEmailInteractor().invoke(data));
}

export async function getCompanyDetailsAction() {
  const result = await getGetCompanySettingsInteractor().invoke();
  return result.data;
}

export async function getRolesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetRolesInteractor().invoke(params));
}

export async function upsertRoleAction(data: UpsertRoleData) {
  return serializeResult(getUpsertRoleInteractor().invoke(data));
}

export async function deleteRoleAction(data: DeleteRoleData) {
  return serializeResult(getDeleteRoleInteractor().invoke(data));
}

export async function getUsersAction(params?: GetQueryParams) {
  return unwrapValidated(getGetUsersInteractor().invoke(params));
}

export async function getUserByIdAction(data: GetUserByIdData) {
  const result = await getGetUserByIdInteractor().invoke(data);
  return result.ok ? result.data : { user: null };
}

export async function getAuditLogsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetAuditLogsInteractor().invoke(params));
}

export async function upsertWebhookAction(data: UpsertWebhookData) {
  return serializeResult(getUpsertWebhookInteractor().invoke(data));
}

export async function deleteWebhookAction(data: DeleteWebhookData) {
  return serializeResult(getDeleteWebhookInteractor().invoke(data));
}

export async function getWebFormSourcesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetWebFormSourcesInteractor().invoke(params));
}

export async function createWebFormSourceAction(data: CreateWebFormSourceData) {
  return serializeResult(getCreateWebFormSourceInteractor().invoke(data));
}

export async function updateWebFormSourceAction(data: UpdateWebFormSourceData) {
  return serializeResult(getUpdateWebFormSourceInteractor().invoke(data));
}

export async function deleteWebFormSourceAction(data: DeleteWebFormSourceData) {
  return serializeResult(getDeleteWebFormSourceInteractor().invoke(data));
}

export async function rotateWebFormSecretAction(data: RotateWebFormSecretData) {
  return serializeResult(getRotateWebFormSecretInteractor().invoke(data));
}

export async function getWebhooksAction(params?: GetQueryParams) {
  return unwrapValidated(getGetWebhooksInteractor().invoke(params));
}

export async function getWebhookDeliveriesAction(params?: GetQueryParams) {
  return unwrapValidated(getGetWebhookDeliveriesInteractor().invoke(params));
}

export async function resendWebhookDeliveryAction(data: ResendWebhookDeliveryData) {
  return serializeResult(getResendWebhookDeliveryInteractor().invoke(data));
}
