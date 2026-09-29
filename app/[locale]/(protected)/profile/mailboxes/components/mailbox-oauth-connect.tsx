"use client";

import type { MailboxOAuthProvider } from "@/generated/prisma";

import { useTranslations } from "next-intl";
import { LogIn } from "lucide-react";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { MailboxOAuthResult } from "@/features/mailbox/oauth/mailbox-oauth.schema";

export type MailboxOAuthOutcome = { result: string; reason: string | null } | null;

type Props = {
  providers: readonly MailboxOAuthProvider[];
  outcome: MailboxOAuthOutcome;
};

function useProviderLabel() {
  const t = useTranslations();

  return (provider: MailboxOAuthProvider) =>
    provider === "google" ? t("Mailbox.oauth.google") : t("Mailbox.oauth.microsoft");
}

function useFailureReason() {
  const t = useTranslations();

  return (reason: string | null) => {
    switch (reason) {
      case CustomErrorCode.mailboxAlreadyConnected:
        return t("Common.errors.mailboxAlreadyConnected");
      case CustomErrorCode.mailboxOAuthNotConfigured:
        return t("Common.errors.mailboxOAuthNotConfigured");
      case CustomErrorCode.mailboxSecretKeyMissing:
        return t("Common.errors.mailboxSecretKeyMissing");
      case CustomErrorCode.mailboxAuthenticationFailed:
        return t("Mailbox.oauth.imapRefused");
      case CustomErrorCode.mailboxUnreachable:
        return t("Common.errors.mailboxUnreachable");
      default:
        return t("Common.errors.mailboxOAuthFailed");
    }
  };
}

export function MailboxOAuthConnect({ providers, outcome }: Props) {
  const t = useTranslations();
  const labelFor = useProviderLabel();
  const reasonFor = useFailureReason();

  return (
    <>
      {outcome?.result === MailboxOAuthResult.connected ? (
        <Alert color="success" description={t("Mailbox.oauth.connected")} />
      ) : null}

      {outcome?.result === MailboxOAuthResult.failed ? (
        <Alert color="danger" description={reasonFor(outcome.reason)} title={t("Mailbox.oauth.failed")} />
      ) : null}

      {providers.length > 0 ? (
        <Card className="w-full max-w-3xl gap-4 py-5">
          <CardContent className="flex flex-col gap-4 px-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium">{t("Mailbox.oauth.title")}</h2>

              <p className="text-subdued text-xs">{t("Mailbox.oauth.description")}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <Button key={provider} asChild variant="secondary">
                  <a data-mailbox-oauth={provider} href={`/api/mailbox/oauth/${provider}/start`}>
                    <LogIn aria-hidden className="size-4" />

                    {labelFor(provider)}
                  </a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
