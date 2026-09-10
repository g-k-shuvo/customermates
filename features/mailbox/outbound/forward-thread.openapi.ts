import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { MAILBOX_MAX_FORWARD_RECIPIENTS, SendReplyOutcomeSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const forwardThreadOperation: ZodOpenApiOperationObject = {
  operationId: "forwardMailboxThread",
  summary: "Forward a mailbox conversation",
  description:
    "Sends the conversation's latest message on to the addresses given, as the mailbox owner and through their own outgoing server. The subject is prefixed with Fwd: and the original is quoted below the note. The forward deliberately carries no In-Reply-To or References header, so the new recipients start a conversation of their own rather than joining the original one. A copy is recorded on the conversation. Requires the mailbox to have outgoing server settings.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.string().uuid() }),
  },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: z.object({
          to: z.array(z.string().email()).min(1).max(MAILBOX_MAX_FORWARD_RECIPIENTS),
          body: z.string().max(100_000).optional(),
        }),
      },
    },
  },
  responses: {
    "201": {
      description: "The conversation was forwarded.",
      content: {
        "application/json": {
          schema: SendReplyOutcomeSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
