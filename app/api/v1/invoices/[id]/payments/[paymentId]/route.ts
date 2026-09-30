import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getDeleteInvoicePaymentInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const { id, paymentId } = await params;
    const result = await getDeleteInvoicePaymentInteractor().invoke({ id, paymentId });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
