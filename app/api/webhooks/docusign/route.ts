import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getHandleSigningCallbackInteractor, getSigningProvider } from "@/core/di";

const SIGNATURE_HEADER = /^x-docusign-signature-\d+$/;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signing = getSigningProvider();
  if (!signing.configured) return NextResponse.json({ error: "E-signature is not configured" }, { status: 404 });

  const body = await request.text();
  const signatures = [...request.headers.entries()]
    .filter(([name]) => SIGNATURE_HEADER.test(name.toLowerCase()))
    .map(([, value]) => value);

  if (!signing.verifyCallback(body, signatures))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const state = signing.parseCallback(body);
  if (!state) return NextResponse.json({ handled: false });

  const result = await getHandleSigningCallbackInteractor().invoke(state);

  return NextResponse.json(result.ok ? result.data : { handled: false });
}
