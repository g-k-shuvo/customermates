import { z } from "zod";

import { MailboxOAuthProvider } from "@/generated/prisma";

import { MAILBOX_DEFAULT_BACKFILL_DAYS, MAILBOX_MAX_BACKFILL_DAYS } from "../mailbox.schema";

export const MAILBOX_OAUTH_STATE_TTL_MS = 10 * 60_000;

export const MAILBOX_OAUTH_STATE_COOKIE = "mailbox_oauth_state";

export const MailboxOAuthResult = {
  connected: "connected",
  failed: "failed",
} as const;

export const StartMailboxOAuthSchema = z.object({
  provider: z.enum(MailboxOAuthProvider),
});

export type StartMailboxOAuthData = z.infer<typeof StartMailboxOAuthSchema>;

export const StartMailboxOAuthDtoSchema = z.object({
  authorizeUrl: z.url(),
  sealedState: z.string().min(1),
});

export type StartMailboxOAuthDto = z.infer<typeof StartMailboxOAuthDtoSchema>;

export const MailboxOAuthStateSchema = z.object({
  provider: z.enum(MailboxOAuthProvider),
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  userId: z.string().min(1),
  issuedAt: z.number().int(),
});

export type MailboxOAuthState = z.infer<typeof MailboxOAuthStateSchema>;

export const ConnectOAuthMailboxSchema = z.object({
  provider: z.enum(MailboxOAuthProvider),
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(512),
  sealedState: z.string().min(1).max(4096),
  backfillDays: z.number().int().min(1).max(MAILBOX_MAX_BACKFILL_DAYS).default(MAILBOX_DEFAULT_BACKFILL_DAYS),
});

export type ConnectOAuthMailboxData = z.infer<typeof ConnectOAuthMailboxSchema>;
