import type { ZodOpenApiOperationObject } from "zod-openapi";

import { PipelineDtoSchema } from "../pipeline.schema";

import { CreatePipelineSchema } from "./create-pipeline.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createPipelineOperation: ZodOpenApiOperationObject = {
  operationId: "createPipeline",
  summary: "Create a pipeline",
  description:
    "Creates a new pipeline, optionally with its initial stages. Marking the pipeline as the default demotes the previous default pipeline in the same write.",
  tags: ["pipelines"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreatePipelineSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The pipeline was created successfully.",
      content: {
        "application/json": {
          schema: PipelineDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
