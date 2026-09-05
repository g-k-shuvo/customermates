import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { LostReasonDtoSchema } from "../lost-reason.schema";

import { BaseUpdateLostReasonSchema } from "./update-lost-reason-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateLostReasonOperation: ZodOpenApiOperationObject = {
  operationId: "updateLostReason",
  summary: "Update a lost reason",
  description:
    "Updates an existing lost reason. Only provided fields are updated. Setting archivedAt hides the reason from new deals without removing it from the deals that already carry it.",
  tags: ["lost-reasons"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: BaseUpdateLostReasonSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The lost reason was updated successfully.",
      content: {
        "application/json": {
          schema: LostReasonDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
