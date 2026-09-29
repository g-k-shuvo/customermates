import type { ZodOpenApiOperationObject } from "zod-openapi";

import { AutomationDtoSchema } from "../automation.schema";
import { DeleteAutomationSchema } from "./delete-automation.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteAutomationOperation: ZodOpenApiOperationObject = {
  operationId: "deleteAutomation",
  summary: "Delete an automation",
  description:
    "Deletes an automation with its runs and returns it as it was. Requires permission to delete automations.",
  tags: ["automations"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: DeleteAutomationSchema },
  responses: {
    "200": {
      description: "The automation was deleted.",
      content: { "application/json": { schema: AutomationDtoSchema } },
    },
    ...CommonApiResponses,
  },
};
