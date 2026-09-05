import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DealDtoSchema } from "../deal.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const reopenDealOperation: ZodOpenApiOperationObject = {
  operationId: "reopenDeal",
  summary: "Reopen a closed deal",
  description:
    "Reopens a won or lost deal. Sets the status back to open, clears wonAt, lostAt, closedAt, the lost reason and the lost notes, and resets the probability to null so the deal inherits its stage weighting again. The deal moves to the first stage of its pipeline.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: false,
    description: "This action takes no request body; the deal is identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The deal was reopened successfully.",
      content: {
        "application/json": {
          schema: DealDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
