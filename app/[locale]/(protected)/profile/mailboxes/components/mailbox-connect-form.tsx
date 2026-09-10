"use client";

import type { ReactNode } from "react";
import type { ConnectMailboxData } from "@/features/mailbox/mailbox.schema";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EyeIcon, EyeOffIcon, PlugZap } from "lucide-react";
import { toast } from "sonner";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { MAILBOX_DEFAULT_BACKFILL_DAYS, MAILBOX_DEFAULT_IMAP_PORT } from "@/features/mailbox/mailbox.schema";

import { connectMailboxAction } from "../actions";
import { EMPTY_MAILBOX_FORM_ERRORS, toMailboxFormErrors, type MailboxFormErrors } from "./mailbox-form-errors";

type Props = {
  onConnected: () => Promise<void>;
};

type ConnectFormState = {
  emailAddress: string;
  displayName: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  username: string;
  secret: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  backfillDays: string;
};

const FIELD_IDS: Record<keyof ConnectFormState, string> = {
  emailAddress: "mailbox-email-address",
  displayName: "mailbox-display-name",
  imapHost: "mailbox-imap-host",
  imapPort: "mailbox-imap-port",
  imapSecure: "mailbox-imap-secure",
  username: "mailbox-username",
  secret: "mailbox-secret",
  smtpHost: "mailbox-smtp-host",
  smtpPort: "mailbox-smtp-port",
  smtpSecure: "mailbox-smtp-secure",
  backfillDays: "mailbox-backfill-days",
};

const INITIAL_FORM: ConnectFormState = {
  emailAddress: "",
  displayName: "",
  imapHost: "",
  imapPort: String(MAILBOX_DEFAULT_IMAP_PORT),
  imapSecure: true,
  username: "",
  secret: "",
  smtpHost: "",
  smtpPort: "",
  smtpSecure: false,
  backfillDays: String(MAILBOX_DEFAULT_BACKFILL_DAYS),
};

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function toConnectInput(form: ConnectFormState): ConnectMailboxData {
  const smtpHost = form.smtpHost.trim();

  return {
    emailAddress: form.emailAddress.trim(),
    displayName: form.displayName.trim() || undefined,
    imapHost: form.imapHost.trim(),
    imapPort: toInteger(form.imapPort, MAILBOX_DEFAULT_IMAP_PORT),
    imapSecure: form.imapSecure,
    username: form.username.trim(),
    secret: form.secret,
    smtpHost: smtpHost || undefined,
    smtpPort: smtpHost ? toOptionalInteger(form.smtpPort) : undefined,
    smtpSecure: smtpHost ? form.smtpSecure : undefined,
    backfillDays: toInteger(form.backfillDays, MAILBOX_DEFAULT_BACKFILL_DAYS),
  };
}

type FieldProps = {
  children: ReactNode;
  fieldId: string;
  label: string;
  description?: string;
  error?: string;
};

function MailboxField({ children, fieldId, label, description, error }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>

      {children}

      {description && <p className="text-subdued text-xs">{description}</p>}

      {error && (
        <p className="text-xs text-destructive" id={`${fieldId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function MailboxConnectForm({ onConnected }: Props) {
  const t = useTranslations();
  const [form, setForm] = useState<ConnectFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<MailboxFormErrors>(EMPTY_MAILBOX_FORM_ERRORS);
  const [showSecret, setShowSecret] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const update = <Key extends keyof ConnectFormState>(key: Key, value: ConnectFormState[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const describedBy = (key: keyof ConnectFormState) => (errors.fields[key] ? `${FIELD_IDS[key]}-error` : undefined);

  const hasNoSmtpHost = form.smtpHost.trim() === "";

  const connect = () => {
    if (isConnecting) return;

    setErrors(EMPTY_MAILBOX_FORM_ERRORS);
    setIsConnecting(true);

    runUserAction(async () => {
      try {
        const result = await connectMailboxAction(toConnectInput(form));

        if (!result.ok) {
          setErrors(toMailboxFormErrors(result.error));
          return;
        }

        toast.success(t("Mailbox.connectSuccess"));
        setForm(INITIAL_FORM);
        setShowSecret(false);
        await onConnected();
      } finally {
        setIsConnecting(false);
      }
    });
  };

  return (
    <Card className="w-full max-w-3xl gap-4 py-5">
      <CardContent className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">{t("Mailbox.connectTitle")}</h2>

          <p className="text-subdued text-xs">{t("Mailbox.connectDescription")}</p>
        </div>

        {errors.form.length > 0 && (
          <Alert color="danger" title={t("Mailbox.connectFailedTitle")}>
            <ul className="flex flex-col gap-1 text-xs">
              {errors.form.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        )}

        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            connect();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MailboxField
              error={errors.fields.emailAddress}
              fieldId={FIELD_IDS.emailAddress}
              label={t("Mailbox.emailAddressLabel")}
            >
              <Input
                required
                aria-describedby={describedBy("emailAddress")}
                aria-invalid={Boolean(errors.fields.emailAddress)}
                autoComplete="off"
                disabled={isConnecting}
                id={FIELD_IDS.emailAddress}
                type="email"
                value={form.emailAddress}
                onChange={(event) => update("emailAddress", event.target.value)}
              />
            </MailboxField>

            <MailboxField
              description={t("Mailbox.displayNameDescription")}
              error={errors.fields.displayName}
              fieldId={FIELD_IDS.displayName}
              label={t("Mailbox.displayNameLabel")}
            >
              <Input
                aria-describedby={describedBy("displayName")}
                aria-invalid={Boolean(errors.fields.displayName)}
                autoComplete="off"
                disabled={isConnecting}
                id={FIELD_IDS.displayName}
                value={form.displayName}
                onChange={(event) => update("displayName", event.target.value)}
              />
            </MailboxField>

            <MailboxField
              error={errors.fields.imapHost}
              fieldId={FIELD_IDS.imapHost}
              label={t("Mailbox.imapHostLabel")}
            >
              <Input
                required
                aria-describedby={describedBy("imapHost")}
                aria-invalid={Boolean(errors.fields.imapHost)}
                autoComplete="off"
                disabled={isConnecting}
                id={FIELD_IDS.imapHost}
                value={form.imapHost}
                onChange={(event) => update("imapHost", event.target.value)}
              />
            </MailboxField>

            <MailboxField
              error={errors.fields.imapPort}
              fieldId={FIELD_IDS.imapPort}
              label={t("Mailbox.imapPortLabel")}
            >
              <Input
                required
                aria-describedby={describedBy("imapPort")}
                aria-invalid={Boolean(errors.fields.imapPort)}
                disabled={isConnecting}
                id={FIELD_IDS.imapPort}
                inputMode="numeric"
                type="number"
                value={form.imapPort}
                onChange={(event) => update("imapPort", event.target.value)}
              />
            </MailboxField>

            <MailboxField
              description={t("Mailbox.usernameDescription")}
              error={errors.fields.username}
              fieldId={FIELD_IDS.username}
              label={t("Mailbox.usernameLabel")}
            >
              <Input
                required
                aria-describedby={describedBy("username")}
                aria-invalid={Boolean(errors.fields.username)}
                autoComplete="off"
                disabled={isConnecting}
                id={FIELD_IDS.username}
                value={form.username}
                onChange={(event) => update("username", event.target.value)}
              />
            </MailboxField>

            <MailboxField
              description={t("Mailbox.secretDescription")}
              error={errors.fields.secret}
              fieldId={FIELD_IDS.secret}
              label={t("Mailbox.secretLabel")}
            >
              <div className="flex items-center gap-2">
                <Input
                  required
                  aria-describedby={describedBy("secret")}
                  aria-invalid={Boolean(errors.fields.secret)}
                  autoComplete="new-password"
                  disabled={isConnecting}
                  id={FIELD_IDS.secret}
                  type={showSecret ? "text" : "password"}
                  value={form.secret}
                  onChange={(event) => update("secret", event.target.value)}
                />

                <Button
                  aria-label={showSecret ? t("Common.ariaLabels.hidePassword") : t("Common.ariaLabels.showPassword")}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setShowSecret((current) => !current)}
                >
                  {showSecret ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
                </Button>
              </div>
            </MailboxField>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <Label className="flex flex-col items-start gap-0.5" htmlFor={FIELD_IDS.imapSecure}>
              <span>{t("Mailbox.imapSecureLabel")}</span>

              <span className="text-subdued text-xs font-normal">{t("Mailbox.imapSecureDescription")}</span>
            </Label>

            <Switch
              checked={form.imapSecure}
              disabled={isConnecting}
              id={FIELD_IDS.imapSecure}
              onCheckedChange={(checked) => update("imapSecure", checked)}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">{t("Mailbox.smtpSectionTitle")}</h3>

              <p className="text-subdued text-xs">{t("Mailbox.smtpSectionDescription")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MailboxField
                error={errors.fields.smtpHost}
                fieldId={FIELD_IDS.smtpHost}
                label={t("Mailbox.smtpHostLabel")}
              >
                <Input
                  aria-describedby={describedBy("smtpHost")}
                  aria-invalid={Boolean(errors.fields.smtpHost)}
                  autoComplete="off"
                  disabled={isConnecting}
                  id={FIELD_IDS.smtpHost}
                  value={form.smtpHost}
                  onChange={(event) => update("smtpHost", event.target.value)}
                />
              </MailboxField>

              <MailboxField
                description={t("Mailbox.smtpPortDescription")}
                error={errors.fields.smtpPort}
                fieldId={FIELD_IDS.smtpPort}
                label={t("Mailbox.smtpPortLabel")}
              >
                <Input
                  aria-describedby={describedBy("smtpPort")}
                  aria-invalid={Boolean(errors.fields.smtpPort)}
                  disabled={isConnecting || hasNoSmtpHost}
                  id={FIELD_IDS.smtpPort}
                  inputMode="numeric"
                  type="number"
                  value={form.smtpPort}
                  onChange={(event) => update("smtpPort", event.target.value)}
                />
              </MailboxField>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label className="flex flex-col items-start gap-0.5" htmlFor={FIELD_IDS.smtpSecure}>
                <span>{t("Mailbox.smtpSecureLabel")}</span>

                <span className="text-subdued text-xs font-normal">{t("Mailbox.smtpSecureDescription")}</span>
              </Label>

              <Switch
                checked={form.smtpSecure}
                disabled={isConnecting || hasNoSmtpHost}
                id={FIELD_IDS.smtpSecure}
                onCheckedChange={(checked) => update("smtpSecure", checked)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MailboxField
              description={t("Mailbox.backfillDaysDescription")}
              error={errors.fields.backfillDays}
              fieldId={FIELD_IDS.backfillDays}
              label={t("Mailbox.backfillDaysLabel")}
            >
              <Input
                required
                aria-describedby={describedBy("backfillDays")}
                aria-invalid={Boolean(errors.fields.backfillDays)}
                disabled={isConnecting}
                id={FIELD_IDS.backfillDays}
                inputMode="numeric"
                type="number"
                value={form.backfillDays}
                onChange={(event) => update("backfillDays", event.target.value)}
              />
            </MailboxField>
          </div>

          <div className="flex justify-end">
            <Button disabled={isConnecting} size="sm" type="submit">
              <PlugZap aria-hidden="true" className="size-3.5" />

              {isConnecting ? t("Mailbox.connectTesting") : t("Mailbox.connectSubmit")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
