import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { AutomationDtoSchema } from "../automation.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getAutomationsOperation: ZodOpenApiOperationObject = {
  operationId: "getAutomations",
  summary: "List automations",
  description:
    "Lists the workspace's automations with their trigger, the fields a record update must touch (`changedFields`), the conditions a record must match (`conditions`, in the same filter language as the data views, including deal `stageId`, `pipelineId` and custom fields) and their steps. Requires read access to all automations.",
  tags: ["automations"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The automations.",
      content: { "application/json": { schema: z.array(AutomationDtoSchema) } },
    },
    ...CommonApiResponses,
  },
};
