"use client";

import type { RecordDocumentEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto } from "@/features/record-documents/record-document.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  getSignatureSuggestionsAction,
  sendForSignatureAction,
} from "@/app/[locale]/(protected)/record-documents/actions";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import {
  SIGNATURE_MESSAGE_MAX_LENGTH,
  SIGNATURE_RECIPIENT_LIMIT,
  SIGNATURE_SUBJECT_MAX_LENGTH,
} from "@/features/record-documents/signing/record-document-signing.schema";

type Props = {
  document: RecordDocumentDto | null;
  entityType: RecordDocumentEntityType;
  recordId: string;
  onClose: () => void;
  onSent: () => Promise<void>;
};

type SignerRow = { key: number; name: string; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let nextSignerKey = 1;

const signerRow = (name = "", email = ""): SignerRow => ({ key: nextSignerKey++, name, email });

export function SendForSignatureModal({ document, entityType, recordId, onClose, onSent }: Props) {
  const t = useTranslations();
  const [signers, setSigners] = useState<SignerRow[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const documentId = document?.id ?? null;
  const documentTitle = document?.title ?? "";

  useEffect(() => {
    if (!documentId) return;

    setSigners([signerRow()]);
    setSubject(
      t("RecordDocuments.signature.defaultSubject", { title: documentTitle }).slice(0, SIGNATURE_SUBJECT_MAX_LENGTH),
    );
    setMessage("");

    runUserAction(async () => {
      const suggestions = await getSignatureSuggestionsAction({ entityType, recordId });
      if (!suggestions.ok || suggestions.data.recipients.length === 0) return;

      setSigners(suggestions.data.recipients.map((recipient) => signerRow(recipient.name, recipient.email)));
    });
  }, [documentId, documentTitle, entityType, recordId, t]);

  const filled = signers.filter((signer) => signer.name.trim() !== "" || signer.email.trim() !== "");
  const valid =
    filled.length > 0 && filled.every((signer) => signer.name.trim() !== "" && EMAIL.test(signer.email.trim()));

  const update = (key: number, change: Partial<SignerRow>) =>
    setSigners((current) => current.map((signer) => (signer.key === key ? { ...signer, ...change } : signer)));

  const send = () =>
    runUserAction(async () => {
      if (!document) return;

      setBusy(true);
      try {
        const result = await sendForSignatureAction({
          id: document.id,
          recipients: filled.map((signer) => ({ name: signer.name.trim(), email: signer.email.trim() })),
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
        });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return;
        }

        toast.success(t("RecordDocuments.signature.sent", { title: document.title }));
        onClose();
        await onSent();
      } finally {
        setBusy(false);
      }
    });

  const title = t("RecordDocuments.signature.title");

  return (
    <AppModal open={document !== null} size="lg" title={title} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-base font-semibold">{title}</h2>
        </AppCardHeader>

        <AppCardBody className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t("RecordDocuments.signature.description", { title: documentTitle })}
          </p>

          <div className="flex flex-col gap-2" data-signature-signers="">
            <p className="text-sm font-medium">{t("RecordDocuments.signature.signers")}</p>

            {signers.map((signer, index) => (
              <div key={signer.key} className="flex items-center gap-2">
                <Input
                  aria-label={t("RecordDocuments.signature.signerName", { number: index + 1 })}
                  maxLength={100}
                  placeholder={t("RecordDocuments.signature.namePlaceholder")}
                  value={signer.name}
                  onChange={(event) => update(signer.key, { name: event.target.value })}
                />

                <Input
                  aria-label={t("RecordDocuments.signature.signerEmail", { number: index + 1 })}
                  maxLength={254}
                  placeholder={t("RecordDocuments.signature.emailPlaceholder")}
                  type="email"
                  value={signer.email}
                  onChange={(event) => update(signer.key, { email: event.target.value })}
                />

                <Button
                  aria-label={t("RecordDocuments.signature.removeSigner", { number: index + 1 })}
                  disabled={signers.length === 1}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setSigners((current) => current.filter((candidate) => candidate.key !== signer.key))}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </div>
            ))}

            <Button
              className="self-start"
              disabled={signers.length >= SIGNATURE_RECIPIENT_LIMIT}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setSigners((current) => [...current, signerRow()])}
            >
              <Plus aria-hidden className="size-4" />

              {t("RecordDocuments.signature.addSigner")}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signature-subject">{t("RecordDocuments.signature.subject")}</Label>

            <Input
              id="signature-subject"
              maxLength={SIGNATURE_SUBJECT_MAX_LENGTH}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signature-message">{t("RecordDocuments.signature.message")}</Label>

            <Textarea
              id="signature-message"
              maxLength={SIGNATURE_MESSAGE_MAX_LENGTH}
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
        </AppCardBody>

        <AppCardFooter>
          <Button disabled={busy} type="button" variant="secondary" onClick={onClose}>
            {t("Common.actions.cancel")}
          </Button>

          <Button disabled={busy || !valid} type="button" onClick={send}>
            {t("RecordDocuments.signature.send")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
}
