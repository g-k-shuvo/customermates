import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetStorageUsageInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET() {
  try {
    const result = await getGetStorageUsageInteractor().invoke();

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
