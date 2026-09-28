import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetBillingProfileInteractor, getUpsertBillingProfileInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetBillingProfileInteractor().invoke({ organizationId: id });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpsertBillingProfileInteractor().invoke({ ...data, organizationId: id });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
