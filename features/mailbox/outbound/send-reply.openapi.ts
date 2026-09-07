import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { SendReplyOutcomeSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const sendReplyOperation: ZodOpenApiOperationObject = {
  operationId: "sendMailboxReply",
  summary: "Reply to a mailbox conversation",
  description:
    "Sends a reply as the mailbox owner through their own outgoing server, threads it with In-Reply-To and References, appends a copy to the IMAP Sent folder, and records it on the conversation. Requires the mailbox to have outgoing server settings.",
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
          body: z.string().min(1).max(100_000),
          replyAll: z.boolean().optional(),
        }),
      },
    },
  },
  responses: {
    "201": {
      description: "The reply was sent.",
      content: {
        "application/json": {
          schema: SendReplyOutcomeSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
