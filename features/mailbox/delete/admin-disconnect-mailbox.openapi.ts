import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const adminDisconnectMailboxOperation: ZodOpenApiOperationObject = {
  operationId: "adminDisconnectMailbox",
  summary: "Disconnect any mailbox in the workspace",
  description:
    "Removes a connected mailbox that belongs to any member of the workspace, together with its sealed credentials and the conversations synced from it. Requires workspace administration rights and exists so an offboarded member's mailbox can be cleaned up once they can no longer sign in. The mail itself stays on the mail server; nothing is deleted there.",
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
