import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";
import { SUBSCRIBABLE_WEBHOOK_EVENTS, WEBHOOK_EVENTS } from "./webhook-event-registry";

export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);

export const SubscribableWebhookEventSchema = z.enum(SUBSCRIBABLE_WEBHOOK_EVENTS);

export const WebhookDtoSchema = z.object({
  id: z.uuid(),
  url: zx.secureUrl(),
  description: z.string().nullable(),
  events: z.array(SubscribableWebhookEventSchema),
  secret: z.string().nullable(),
  headers: z.record(z.string(), z.string()).nullable(),
  bodyTemplate: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WebhookDto = Data<typeof WebhookDtoSchema>;

export const WebhookPublicDtoSchema = WebhookDtoSchema.omit({
  secret: true,
  headers: true,
}).extend({
  hasSecret: z.boolean(),
  headerNames: z.array(z.string()),
});
