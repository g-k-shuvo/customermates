import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { AutomationDtoSchema } from "../automation.schema";
import { UpsertAutomationFieldsSchema } from "./upsert-automation.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

const TRIGGER_RULES =
  '`triggerKind` is `recordCreated`, `recordUpdated`, `recordDeleted` (with `entityType`) or `schedule` (with a cron `schedule` and optional `scheduleTimeZone`). For `recordUpdated`, `changedFields` limits runs to updates that touched one of those fields; `conditions` limits runs to records that match. `changedFields: ["stageId"]` with a condition `stageId in [<stage>]` runs exactly when a deal moves into that stage. Passing `steps` replaces all steps; runs already admitted keep the steps they started with.';

export const createAutomationOperation: ZodOpenApiOperationObject = {
  operationId: "createAutomation",
  summary: "Create an automation",
  description: `Creates an automation. \`name\`, \`triggerKind\` and \`steps\` are required. ${TRIGGER_RULES} Requires permission to update automations.`,
  tags: ["automations"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: { "application/json": { schema: UpsertAutomationFieldsSchema.omit({ id: true }) } },
  },
  responses: {
    "201": {
      description: "The automation was created.",
      content: { "application/json": { schema: AutomationDtoSchema } },
    },
    ...CommonApiResponses,
  },
};

export const updateAutomationOperation: ZodOpenApiOperationObject = {
  operationId: "updateAutomation",
  summary: "Update an automation",
  description: `Changes any of an automation's fields; only the fields passed change. ${TRIGGER_RULES} Requires permission to update automations.`,
  tags: ["automations"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: { "application/json": { schema: UpsertAutomationFieldsSchema.omit({ id: true }) } },
  },
  responses: {
    "200": {
      description: "The automation was updated.",
      content: { "application/json": { schema: AutomationDtoSchema } },
    },
    ...CommonApiResponses,
  },
};
