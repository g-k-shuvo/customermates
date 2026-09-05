import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LostReasonDtoSchema } from "../lost-reason.schema";

import { CreateLostReasonSchema } from "./create-lost-reason.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createLostReasonOperation: ZodOpenApiOperationObject = {
  operationId: "createLostReason",
  summary: "Create a lost reason",
  description:
    "Creates a new lost reason for the company. Lost reasons are offered when a deal is marked lost and are ordered by position.",
  tags: ["lost-reasons"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreateLostReasonSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The lost reason was created successfully.",
      content: {
        "application/json": {
          schema: LostReasonDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
