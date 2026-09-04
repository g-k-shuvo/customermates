import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeletePipelineSchema } from "./delete-pipeline.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deletePipelineOperation: ZodOpenApiOperationObject = {
  operationId: "deletePipeline",
  summary: "Delete a pipeline",
  description: "Deletes a pipeline and its stages from the database.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeletePipelineSchema,
  },
  responses: {
    "200": {
      description: "The pipeline was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
