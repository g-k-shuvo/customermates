import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ConnectMailboxSchema, MailboxCredentialDtoSchema } from "../mailbox.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const connectMailboxOperation: ZodOpenApiOperationObject = {
  operationId: "connectMailbox",
  summary: "Connect a mailbox",
  description:
    "Verifies the IMAP credentials against the mail server and stores the mailbox only when that succeeds, so a wrong host, port or password is reported instead of saved. The password is sealed with AES-256-GCM before it is written and is never returned.",
  tags: ["mailbox"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: ConnectMailboxSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The mailbox was verified and connected.",
      content: {
        "application/json": {
          schema: MailboxCredentialDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
