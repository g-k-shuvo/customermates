import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { LinkThreadDealOutcomeSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const linkThreadDealOperation: ZodOpenApiOperationObject = {
  operationId: "linkMailboxThreadDeal",
  summary: "Confirm or remove the deal a mailbox conversation belongs to",
  description:
    "A conversation is offered a deal only when the contacts it matches have exactly one open deal between them, and the offer has to be confirmed here. Any other deal id is rejected rather than guessed at, and sending null removes an existing link. Confirming a deal also shares the conversation, because the deal's record is where it then appears.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.string().uuid() }),
  },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: z.object({ dealId: z.string().uuid().nullable() }),
      },
    },
  },
  responses: {
    "200": {
      description: "The conversation's deal link was updated.",
      content: {
        "application/json": {
          schema: LinkThreadDealOutcomeSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
