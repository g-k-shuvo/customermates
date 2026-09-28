import type { NextRequest } from "next/server";
import type { GetInvoicesData } from "@/features/invoices/invoice.schema";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCreateInvoiceInteractor, getGetInvoicesInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = searchParams.get("page");
    const status = searchParams.get("status");
    const dealId = searchParams.get("dealId");
    const organizationId = searchParams.get("organizationId");
    const result = await getGetInvoicesInteractor().invoke({
      ...(status ? { status: status as GetInvoicesData["status"] } : {}),
      ...(dealId ? { dealId } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(page ? { page: Number(page) } : {}),
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
    const result = await getCreateInvoiceInteractor().invoke(data);

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
