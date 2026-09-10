import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { MailboxAccountDtoSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getMailboxAccountsOperation: ZodOpenApiOperationObject = {
  operationId: "getMailboxAccounts",
  summary: "Get connected mailboxes",
  description:
    "Retrieves the IMAP mailboxes connected to the company, oldest first. The stored password is sealed and never leaves the server, so it is absent from every field of this response.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The connected mailboxes were retrieved successfully.",
      content: {
        "application/json": {
          schema: z.array(MailboxAccountDtoSchema),
        },
      },
    },
    ...CommonApiResponses,
  },
};
