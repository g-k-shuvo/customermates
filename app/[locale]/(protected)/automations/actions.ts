"use server";

import type { UpsertAutomationData } from "@/features/automation/upsert/upsert-automation.interactor";
import type { DeleteAutomationData } from "@/features/automation/delete/delete-automation.interactor";
import type { GetAutomationRunsData } from "@/features/automation/get/get-automation-runs.interactor";

import { Status } from "@/generated/prisma";

import {
  getDeleteAutomationInteractor,
  getGetAutomationRunsInteractor,
  getGetAutomationsInteractor,
  getUpsertAutomationInteractor,
  getGetCustomColumnsInteractor,
  getGetPipelinesInteractor,
  getGetUsersApiInteractor,
  getGetWidgetFilterableFieldsInteractor,
} from "@/core/di";
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

export async function getAutomationRunsAction(data: GetAutomationRunsData) {
  return unwrapValidated(getGetAutomationRunsInteractor().invoke(data));
}

export async function getAutomationConditionFieldsAction() {
  const [filterableFields, customColumns] = await Promise.all([
    unwrapValidated(getGetWidgetFilterableFieldsInteractor().invoke()),
    unwrapValidated(getGetCustomColumnsInteractor().invoke()),
  ]);

  return { filterableFields: filterableFields.chart, customColumns };
}

export async function getAutomationAuthoringOptionsAction() {
  const [users, pipelines] = await Promise.all([
    getGetUsersApiInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }),
    getGetPipelinesInteractor().invoke(),
  ]);

  return {
    users: users.ok
      ? users.data.items
          .filter((user) => user.status === Status.active)
          .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() || user.email }))
      : [],
    pipelines: pipelines.ok
      ? pipelines.data
          .filter((pipeline) => !pipeline.archivedAt)
          .map((pipeline) => ({
            id: pipeline.id,
            name: pipeline.name,
            stages: pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name })),
          }))
      : [],
  };
}
