import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getHandleDeliveryEventInteractor } from "@/core/di";
import { env } from "@/env";
import { parseResendEvent } from "@/features/messaging-send/tracking/resend-event";
import { verifySvixSignature } from "@/features/messaging-send/tracking/svix-signature";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Delivery tracking is not configured" }, { status: 404 });

  const body = await request.text();
  const headers = {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  };

  if (!verifySvixSignature({ secret, headers, body }))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const event = parseResendEvent(body, headers.id);
  if (!event) return NextResponse.json({ handled: false });

  const result = await getHandleDeliveryEventInteractor().invoke(event);

  return NextResponse.json(result.ok ? result.data : { handled: false });
}
