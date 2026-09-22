import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getIngestWebFormSubmissionInteractor } from "@/core/di";
import { WEBFORM_SIGNATURE_HEADER } from "@/features/webform/ingest/webform-signature";

export const runtime = "nodejs";

const STATUS_BY_OUTCOME = {
  accepted: 202,
  duplicate: 200,
  "unknown-source": 404,
  "invalid-signature": 401,
  "rate-limited": 429,
  "invalid-body": 400,
} as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rawBody = await request.text();

  const result = await getIngestWebFormSubmissionInteractor().invoke({
    slug,
    rawBody,
    signatureHeader: request.headers.get(WEBFORM_SIGNATURE_HEADER),
  });

  if (!result.ok) return NextResponse.json({ status: "rejected" }, { status: 400 });

  const { outcome, submissionId } = result.data;

  return NextResponse.json({ status: outcome, submissionId }, { status: STATUS_BY_OUTCOME[outcome] });
}
