import { z } from "zod";

import { MessageDeliveryEventKind } from "@/generated/prisma";

const RESEND_EVENT_KINDS: Record<string, MessageDeliveryEventKind> = {
  "email.delivered": MessageDeliveryEventKind.delivered,
  "email.delivery_delayed": MessageDeliveryEventKind.delayed,
  "email.bounced": MessageDeliveryEventKind.bounced,
  "email.complained": MessageDeliveryEventKind.complained,
};

const ResendEventSchema = z.object({
  type: z.string(),
  created_at: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    bounce: z.object({ type: z.string().optional(), message: z.string().optional() }).optional(),
  }),
});

export type DeliveryEvent = {
  kind: MessageDeliveryEventKind;
  providerMessageId: string;
  occurredAt: Date;
  providerEventId: string | null;
  detail: string | null;
  suppresses: boolean;
};

export function parseResendEvent(body: string, providerEventId: string | null): DeliveryEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }

  const parsed = ResendEventSchema.safeParse(json);
  if (!parsed.success) return null;

  const kind = RESEND_EVENT_KINDS[parsed.data.type];
  const occurredAt = new Date(parsed.data.created_at);
  if (!kind || Number.isNaN(occurredAt.getTime())) return null;

  const bounce = parsed.data.data.bounce;
  const transient = bounce?.type?.toLowerCase() === "transient";

  return {
    kind,
    providerMessageId: parsed.data.data.email_id,
    occurredAt,
    providerEventId,
    detail: bounce ? [bounce.type, bounce.message].filter(Boolean).join(": ") || null : null,
    suppresses:
      kind === MessageDeliveryEventKind.complained || (kind === MessageDeliveryEventKind.bounced && !transient),
  };
}
