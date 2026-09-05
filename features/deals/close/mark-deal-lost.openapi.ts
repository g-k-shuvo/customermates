import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { MarkDealLostSchema } from "./mark-deal-lost.interactor";
import { DealDtoSchema } from "../deal.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const markDealLostOperation: ZodOpenApiOperationObject = {
  operationId: "markDealLost",
  summary: "Mark a deal lost",
  description:
    "Closes a deal as lost. Requires a lost reason that belongs to this company. Sets the status to lost, stamps lostAt and closedAt, forces the probability to 0 and clears wonAt. When the deal's pipeline has a lost stage, the deal is moved there.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: MarkDealLostSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The deal was marked lost successfully.",
      content: {
        "application/json": {
          schema: DealDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
