import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetMailAttachmentInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { contentDisposition } from "@/core/storage/upload-policy";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetMailAttachmentInteractor().invoke({ id });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    const { body, byteSize, contentType, disposition, fileName } = result.data;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(byteSize),
        "Content-Disposition": contentDisposition(disposition, fileName),
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
