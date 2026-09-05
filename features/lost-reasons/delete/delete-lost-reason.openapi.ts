import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteLostReasonSchema } from "./delete-lost-reason.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteLostReasonOperation: ZodOpenApiOperationObject = {
  operationId: "deleteLostReason",
  summary: "Delete a lost reason",
  description:
    "Deletes a lost reason from the database. Deals that carried it keep their lost notes and are left without a reason.",
  tags: ["lost-reasons"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteLostReasonSchema,
  },
  responses: {
    "200": {
      description: "The lost reason was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
