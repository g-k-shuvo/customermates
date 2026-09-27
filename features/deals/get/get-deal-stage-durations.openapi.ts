import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DealStageDurationsDtoSchema } from "../deal-stage-durations.schema";

import { GetDealStageDurationsSchema } from "./get-deal-stage-durations.interactor";

import { CommonApiResponses, ErrorResponseSchema } from "@/core/api/interactor-handler";

export const getDealStageDurationsOperation: ZodOpenApiOperationObject = {
  operationId: "getDealStageDurations",
  summary: "Get a deal's time in stage",
  description:
    "Returns how long a deal has spent in each stage of its pipeline, in pipeline order. Each stage adds up every closed visit from the deal's stage history plus the open visit of the current stage, measured up to `measuredAt`. Stages the deal never entered are listed with 0 seconds, so the result always covers the whole pipeline. Time spent in the stages of another pipeline the deal was moved out of is not included. A deal without a pipeline returns an empty list.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetDealStageDurationsSchema,
  },
  responses: {
    "200": {
      description: "The deal's time in each stage was retrieved successfully.",
      content: {
        "application/json": {
          schema: DealStageDurationsDtoSchema,
        },
      },
    },
    "404": {
      description: "No deal with this ID exists, or the caller is not allowed to see it.",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
