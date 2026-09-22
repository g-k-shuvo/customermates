import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteLeadSchema } from "./delete-lead.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteLeadOperation: ZodOpenApiOperationObject = {
  operationId: "deleteLead",
  summary: "Delete a lead",
  description: "Deletes a lead by its unique identifier.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteLeadSchema,
  },
  responses: {
    "200": {
      description: "The lead was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
