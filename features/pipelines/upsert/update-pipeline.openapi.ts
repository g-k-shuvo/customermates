import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { PipelineDtoSchema } from "../pipeline.schema";

import { BaseUpdatePipelineSchema } from "./update-pipeline-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updatePipelineOperation: ZodOpenApiOperationObject = {
  operationId: "updatePipeline",
  summary: "Update a pipeline",
  description:
    "Updates an existing pipeline. Only provided fields are updated. Marking the pipeline as the default demotes the previous default pipeline in the same write.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: BaseUpdatePipelineSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The pipeline was updated successfully.",
      content: {
        "application/json": {
          schema: PipelineDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
