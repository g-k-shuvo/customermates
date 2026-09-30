import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getGetSenderIdentityInteractor,
  getResetSenderIdentityInteractor,
  getSaveSenderIdentityInteractor,
} from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET() {
  try {
    const result = await getGetSenderIdentityInteractor().invoke();

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getSaveSenderIdentityInteractor().invoke(data);

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE() {
  try {
    const result = await getResetSenderIdentityInteractor().invoke({});

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
