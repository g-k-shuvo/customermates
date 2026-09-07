import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { MailboxThreadSummaryDtoSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getMailboxThreadsOperation: ZodOpenApiOperationObject = {
  operationId: "getMailboxThreads",
  summary: "Get mailbox conversations",
  description:
    "Retrieves the email conversations synced from the company's connected mailboxes, most recently active first.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The conversations were retrieved successfully.",
      content: {
        "application/json": {
          schema: z.array(MailboxThreadSummaryDtoSchema),
        },
      },
    },
    ...CommonApiResponses,
  },
};
