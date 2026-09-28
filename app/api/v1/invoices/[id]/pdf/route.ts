import type { NextRequest } from "next/server";
import type { GetInvoiceDocumentData } from "@/features/invoices/document/get-invoice-document.interactor";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetInvoiceDocumentInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { interactorFailureStatus } from "@/core/validation/validation.utils";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const locale = request.nextUrl.searchParams.get("locale");
    const result = await getGetInvoiceDocumentInteractor().invoke({
      id,
      format: "pdf",
      ...(locale ? { locale: locale as GetInvoiceDocumentData["locale"] } : {}),
    });

    if (!result.ok)
      return NextResponse.json(z.prettifyError(result.error), { status: interactorFailureStatus(result.error) });

    return new NextResponse(Buffer.from(result.data.body), {
      status: 200,
      headers: {
        "Content-Type": result.data.contentType,
        "Content-Disposition": `attachment; filename="${result.data.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
