import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { AutomationRunDtoSchema } from "../automation.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getAutomationRunsOperation: ZodOpenApiOperationObject = {
  operationId: "getAutomationRuns",
  summary: "List an automation's runs",
  description:
    "Lists the automation's most recent runs, newest first, each with its status (`queued`, `running`, `succeeded`, `failed`, `skipped` when the conditions did not match), the record it ran for and the outcome of every step.",
  tags: ["automations"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": { description: "The runs.", content: { "application/json": { schema: z.array(AutomationRunDtoSchema) } } },
    ...CommonApiResponses,
  },
};
