import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { MailboxThreadDtoSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getMailboxThreadOperation: ZodOpenApiOperationObject = {
  operationId: "getMailboxThread",
  summary: "Get a mailbox conversation",
  description:
    "Retrieves one conversation with its messages, oldest first, and marks it read. Message bodies are sanitised before they leave the server; remote images stay withheld unless allowRemoteImages is set, because a remote image in mail reports when the message was opened.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.string().uuid() }),
    query: z.object({ allowRemoteImages: z.enum(["true", "false"]).optional() }),
  },
  responses: {
    "200": {
      description: "The conversation was retrieved successfully.",
      content: {
        "application/json": {
          schema: MailboxThreadDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
