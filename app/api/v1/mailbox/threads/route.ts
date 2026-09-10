import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetMailboxThreadsInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getGetMailboxThreadsInteractor().invoke({
      query: searchParams.get("query") ?? undefined,
      folder: searchParams.get("folder") ?? undefined,
    });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
