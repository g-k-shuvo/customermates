import type { ZodOpenApiOperationObject } from "zod-openapi";

import { MarkDealWonSchema } from "./mark-deal-won.interactor";
import { DealDtoSchema } from "../deal.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const markDealWonOperation: ZodOpenApiOperationObject = {
  operationId: "markDealWon",
  summary: "Mark a deal won",
  description:
    "Closes a deal as won. Sets the status to won, stamps wonAt and closedAt, forces the probability to 100 and clears any lost reason. When the deal's pipeline has a won stage, the deal is moved there.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: MarkDealWonSchema },
  requestBody: {
    required: false,
    description: "This action takes no request body; the deal is identified by the path.",
    content: {},
  },
  responses: {
    "200": {
      description: "The deal was marked won successfully.",
      content: {
        "application/json": {
          schema: DealDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
