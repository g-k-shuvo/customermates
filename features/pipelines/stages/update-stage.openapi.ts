import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { PipelineStageDtoSchema } from "../pipeline.schema";

import { UpdateStageSchema } from "./update-stage.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updatePipelineStageOperation: ZodOpenApiOperationObject = {
  operationId: "updatePipelineStage",
  summary: "Update a pipeline stage",
  description: "Updates an existing pipeline stage. Only provided fields are updated.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateStageSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The pipeline stage was updated successfully.",
      content: {
        "application/json": {
          schema: PipelineStageDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
