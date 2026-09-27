import type { NextRequest } from "next/server";
import type { RecordFileTargetData } from "@/features/record-files/record-file.schema";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetSignatureSuggestionsInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const result = await getGetSignatureSuggestionsInteractor().invoke({
      entityType: searchParams.get("entityType") as RecordFileTargetData["entityType"],
      recordId: searchParams.get("recordId") ?? "",
    });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
