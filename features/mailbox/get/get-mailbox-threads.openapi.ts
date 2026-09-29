import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { GetMailboxThreadsSchema, MailboxThreadSummaryDtoSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getMailboxThreadsOperation: ZodOpenApiOperationObject = {
  operationId: "getMailboxThreads",
  summary: "Get mailbox conversations",
  description:
    "Retrieves the email conversations synced from the company's connected mailboxes, most recently active first. The optional query matches the conversation subject and the participants' addresses and names, case-insensitively; the optional folder keeps the conversations that hold a message stored in that IMAP folder. The view defaults to inbox, which leaves out archived conversations; archived, drafts (your own drafts), outbox (your scheduled or failed sends), followUp (a follow-up date is set) and all select the other views. The optional labelId keeps the conversations carrying that label.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    query: GetMailboxThreadsSchema,
  },
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
