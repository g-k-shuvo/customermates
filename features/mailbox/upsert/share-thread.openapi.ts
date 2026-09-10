import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { MailboxThreadSummaryDtoSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const shareThreadOperation: ZodOpenApiOperationObject = {
  operationId: "shareMailboxThread",
  summary: "Share or unshare a mailbox conversation",
  description:
    "Controls whether a conversation appears on the contacts and deals it matches. Conversations are private until shared, so a personal mailbox does not surface on shared records by default. Unsharing also removes any deal link, because a linked conversation is readable by everyone who can open that record.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.string().uuid() }),
  },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: z.object({ shared: z.boolean() }),
      },
    },
  },
  responses: {
    "200": {
      description: "The conversation's sharing was updated.",
      content: {
        "application/json": {
          schema: MailboxThreadSummaryDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
