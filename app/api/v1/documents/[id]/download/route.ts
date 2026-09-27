import type { NextRequest } from "next/server";
import type { GetRecordDocumentDownloadData } from "@/features/record-documents/get/get-record-document-download.interactor";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetRecordDocumentDownloadInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const version = request.nextUrl.searchParams.get("version") ?? undefined;
    const result = await getGetRecordDocumentDownloadInteractor().invoke({
      id,
      version: version as GetRecordDocumentDownloadData["version"],
    });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
