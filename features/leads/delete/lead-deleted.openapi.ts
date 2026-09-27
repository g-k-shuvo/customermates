import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { LeadDtoSchema } from "../lead.schema";

export const WebhookLeadDeletedSchema = z.object({
  event: z.literal("lead.deleted"),
  data: z.object({
    userId: z.uuid().nullable(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: LeadDtoSchema,
  }),
  timestamp: z.iso.datetime(),
});

export const webhookLeadDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookLeadDeleted",
  summary: "Lead Deleted",
  description:
    "Sent when a lead is deleted. userId is null when the lead was deleted by the system, such as a web form submission.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookLeadDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
