import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { PipelineStageDtoSchema } from "../pipeline.schema";

import { CreateStageSchema } from "./create-stage.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createPipelineStageOperation: ZodOpenApiOperationObject = {
  operationId: "createPipelineStage",
  summary: "Create a pipeline stage",
  description: "Creates a new stage in the given pipeline. Name is required. All other fields are optional.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreateStageSchema.omit({ pipelineId: true }),
      },
    },
  },
  responses: {
    "201": {
      description: "The pipeline stage was created successfully.",
      content: {
        "application/json": {
          schema: PipelineStageDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
