"use server";

import type {
  CreateLeadAssignmentRuleData,
  UpdateLeadAssignmentRuleData,
} from "@/features/lead-assignment/lead-assignment.schema";

import { EntityType, Status } from "@/generated/prisma";

import {
  getCreateLeadAssignmentRuleInteractor,
  getDeleteLeadAssignmentRuleInteractor,
  getGetCustomColumnsInteractor,
  getGetLeadAssignmentRulesInteractor,
  getGetUsersApiInteractor,
  getGetWidgetFilterableFieldsInteractor,
  getUpdateLeadAssignmentRuleInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getLeadAssignmentRulesAction() {
  return await serializeResult(getGetLeadAssignmentRulesInteractor().invoke());
}

export async function createLeadAssignmentRuleAction(data: CreateLeadAssignmentRuleData) {
  return await serializeResult(getCreateLeadAssignmentRuleInteractor().invoke(data));
}

export async function updateLeadAssignmentRuleAction(data: UpdateLeadAssignmentRuleData) {
  return await serializeResult(getUpdateLeadAssignmentRuleInteractor().invoke(data));
}

export async function deleteLeadAssignmentRuleAction(id: string) {
  return await serializeResult(getDeleteLeadAssignmentRuleInteractor().invoke({ id }));
}

export async function getLeadAssignmentOptionsAction() {
  const [fields, columns, users] = await Promise.all([
    getGetWidgetFilterableFieldsInteractor().invoke(),
    getGetCustomColumnsInteractor().invoke(),
    getGetUsersApiInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }),
  ]);

  return {
    filterableFields: fields.ok ? (fields.data.chart.lead ?? []) : [],
    customColumns: columns.ok ? columns.data.filter((column) => column.entityType === EntityType.lead) : [],
    users: users.ok
      ? users.data.items
          .filter((user) => user.status === Status.active)
          .map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() || user.email }))
      : [],
  };
}
