import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { PipelineDtoSchema } from "../pipeline.schema";

import { ReorderStagesSchema } from "./reorder-stages.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const reorderStagesOperation: ZodOpenApiOperationObject = {
  operationId: "reorderPipelineStages",
  summary: "Reorder pipeline stages",
  description:
    "Repositions the stages of a pipeline in the given order. Every stage id must belong to the pipeline; stages left out keep their order after the listed ones.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: ReorderStagesSchema.omit({ pipelineId: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The pipeline stages were reordered successfully.",
      content: {
        "application/json": {
          schema: PipelineDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
