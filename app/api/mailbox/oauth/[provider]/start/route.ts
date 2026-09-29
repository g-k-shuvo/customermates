import type { NextRequest } from "next/server";
import type { MailboxOAuthProvider } from "@/generated/prisma";

import { NextResponse } from "next/server";

import { env } from "@/env";
import { getStartMailboxOAuthInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { MAILBOX_OAUTH_STATE_COOKIE, MAILBOX_OAUTH_STATE_TTL_MS } from "@/features/mailbox/oauth/mailbox-oauth.schema";
import { mailboxOAuthFailedUrl } from "@/features/mailbox/oauth/mailbox-oauth-outcome";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params;
    const result = await getStartMailboxOAuthInteractor().invoke({ provider: provider as MailboxOAuthProvider });

    if (!result.ok) return NextResponse.redirect(mailboxOAuthFailedUrl(env.BASE_URL, result.error));

    const response = NextResponse.redirect(result.data.authorizeUrl);
    response.cookies.set(MAILBOX_OAUTH_STATE_COOKIE, result.data.sealedState, {
      httpOnly: true,
      secure: env.BASE_URL.startsWith("https:"),
      sameSite: "lax",
      path: "/api/mailbox/oauth",
      maxAge: MAILBOX_OAUTH_STATE_TTL_MS / 1000,
    });

    return response;
  } catch (error) {
    return handleError(error);
  }
}
