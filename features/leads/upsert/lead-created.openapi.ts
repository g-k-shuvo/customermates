import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { LeadDtoSchema } from "../lead.schema";

export const WebhookLeadCreatedSchema = z.object({
  event: z.literal("lead.created"),
  data: z.object({
    userId: z.uuid().nullable(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: LeadDtoSchema,
  }),
  timestamp: z.iso.datetime(),
});

export const webhookLeadCreatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookLeadCreated",
  summary: "Lead Created",
  description:
    "Sent when a lead is created. userId is null when the lead was created by the system, such as a web form submission.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookLeadCreatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
