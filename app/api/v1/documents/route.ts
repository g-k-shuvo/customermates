import type { NextRequest } from "next/server";
import type { RecordDocumentTargetData } from "@/features/record-files/record-file.schema";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCreateRecordDocumentInteractor, getGetRecordDocumentsInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const result = await getGetRecordDocumentsInteractor().invoke({
      entityType: searchParams.get("entityType") as RecordDocumentTargetData["entityType"],
      recordId: searchParams.get("recordId") ?? "",
    });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getCreateRecordDocumentInteractor().invoke(data);

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
