import type { z } from "zod";

import { serializeInteractorFailure } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { MailboxOAuthResult } from "./mailbox-oauth.schema";

const MAILBOXES_PATH = "/profile/mailboxes";

export const MAILBOX_OAUTH_RESULT_PARAM = "mailboxOAuth";
export const MAILBOX_OAUTH_REASON_PARAM = "reason";

export function mailboxOAuthConnectedUrl(baseUrl: string): URL {
  const url = new URL(MAILBOXES_PATH, baseUrl);
  url.searchParams.set(MAILBOX_OAUTH_RESULT_PARAM, MailboxOAuthResult.connected);

  return url;
}

export function mailboxOAuthFailedUrl(baseUrl: string, error?: z.ZodError): URL {
  const reason =
    (error && serializeInteractorFailure(error).issues.find((issue) => issue.customCode)?.customCode) ??
    CustomErrorCode.mailboxOAuthFailed;
  const url = new URL(MAILBOXES_PATH, baseUrl);
  url.searchParams.set(MAILBOX_OAUTH_RESULT_PARAM, MailboxOAuthResult.failed);
  url.searchParams.set(MAILBOX_OAUTH_REASON_PARAM, reason);

  return url;
}
