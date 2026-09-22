import { NextResponse } from "next/server";

import { getGetLeadsConfigurationInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await getGetLeadsConfigurationInteractor().invoke();

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
