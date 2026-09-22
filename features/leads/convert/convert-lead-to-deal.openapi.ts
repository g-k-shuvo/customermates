import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DealDtoSchema } from "@/features/deals/deal.schema";

import { ConvertLeadToDealSchema } from "./convert-lead-to-deal.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const convertLeadToDealOperation: ZodOpenApiOperationObject = {
  operationId: "convertLeadToDeal",
  summary: "Convert a lead into a deal",
  description:
    "Creates a deal from the lead and marks the lead converted. The deal takes the lead's title unless a name is given, and carries over the lead's contact, organization, owner and notes. The lead keeps its own record, gains convertedDealId and convertedAt, and moves to the converted status. A lead that has already been converted is rejected.",
  tags: ["leads"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: ConvertLeadToDealSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "201": {
      description: "The deal was created and the lead was marked converted.",
      content: {
        "application/json": {
          schema: DealDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
