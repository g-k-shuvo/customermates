import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const disconnectMailboxOperation: ZodOpenApiOperationObject = {
  operationId: "disconnectMailbox",
  summary: "Disconnect a mailbox",
  description:
    "Removes a connected mailbox together with its sealed credentials and the conversations synced from it. The mail itself stays on the mail server; nothing is deleted there.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.string().uuid() }),
  },
  responses: {
    "200": {
      description: "The mailbox was disconnected.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
