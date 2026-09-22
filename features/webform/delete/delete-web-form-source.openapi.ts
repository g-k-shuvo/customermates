import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteWebFormSourceSchema } from "./delete-web-form-source.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteWebFormSourceOperation: ZodOpenApiOperationObject = {
  operationId: "deleteWebFormSource",
  summary: "Delete a web form source",
  description:
    "Removes the source and its endpoint. Submissions already stored keep their rows, and leads already created keep their own records but lose the source reference. Deactivate the source instead if you only want to stop accepting submissions.",
  tags: ["webform-sources"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: DeleteWebFormSourceSchema },
  responses: {
    "200": {
      description: "The source was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
