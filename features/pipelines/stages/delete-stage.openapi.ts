import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteStageSchema } from "./delete-stage.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deletePipelineStageOperation: ZodOpenApiOperationObject = {
  operationId: "deletePipelineStage",
  summary: "Delete a pipeline stage",
  description:
    "Deletes a pipeline stage. A pipeline must keep at least one stage, and a stage that still holds deals can only be deleted when moveToStageId names another stage of the same pipeline to receive them.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteStageSchema.pick({ id: true }),
    query: DeleteStageSchema.pick({ moveToStageId: true }),
  },
  responses: {
    "200": {
      description: "The pipeline stage was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
