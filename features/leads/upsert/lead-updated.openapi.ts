import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { LeadDtoSchema } from "../lead.schema";
import { changesSchema } from "@/core/openapi/changes-schema";

export const WebhookLeadUpdatedSchema = z.object({
  event: z.literal("lead.updated"),
  data: z.object({
    userId: z.uuid().nullable(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      lead: LeadDtoSchema,
      changes: changesSchema(LeadDtoSchema.shape),
    }),
  }),
  timestamp: z.iso.datetime(),
});

export const webhookLeadUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookLeadUpdated",
  summary: "Lead Updated",
  description: "Sent when a lead is updated. userId is null when the lead was updated by the system.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookLeadUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
