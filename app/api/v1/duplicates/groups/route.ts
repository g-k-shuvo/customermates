import type { NextRequest } from "next/server";
import type { GetDuplicateGroupsData } from "@/features/duplicates/duplicate.schema";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetDuplicateGroupsInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = searchParams.get("page");
    const result = await getGetDuplicateGroupsInteractor().invoke({
      entityType: searchParams.get("entityType") as GetDuplicateGroupsData["entityType"],
      ...(page ? { page: Number(page) } : {}),
    });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
