import type { NextRequest } from "next/server";
import type { MailboxOAuthProvider } from "@/generated/prisma";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { getConnectOAuthMailboxInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { MAILBOX_OAUTH_STATE_COOKIE } from "@/features/mailbox/oauth/mailbox-oauth.schema";
import { MAILBOX_DEFAULT_BACKFILL_DAYS } from "@/features/mailbox/mailbox.schema";
import { mailboxOAuthConnectedUrl, mailboxOAuthFailedUrl } from "@/features/mailbox/oauth/mailbox-oauth-outcome";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const sealedState = request.cookies.get(MAILBOX_OAUTH_STATE_COOKIE)?.value;

    const result =
      code && state && sealedState
        ? await getConnectOAuthMailboxInteractor().invoke({
            provider: provider as MailboxOAuthProvider,
            code,
            state,
            sealedState,
            backfillDays: MAILBOX_DEFAULT_BACKFILL_DAYS,
          })
        : null;

    const response = NextResponse.redirect(
      result?.ok ? mailboxOAuthConnectedUrl(env.BASE_URL) : mailboxOAuthFailedUrl(env.BASE_URL, result?.error),
    );
    response.cookies.delete({ name: MAILBOX_OAUTH_STATE_COOKIE, path: "/api/mailbox/oauth" });

    return response;
  } catch (error) {
    return handleError(error);
  }
}
