"use client";

import type { MailAttachmentDto } from "@/features/mail-attachments/mail-attachment.schema";

import { useTranslations } from "next-intl";
import { FileWarning, Paperclip } from "lucide-react";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { mailAttachmentPath } from "@/features/mail-attachments/mail-attachment.schema";

const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;

export function MailMessageAttachments({ attachments }: { attachments: readonly MailAttachmentDto[] }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  if (attachments.length === 0) return null;

  const sizeLabel = (bytes: number) => {
    if (bytes < KILOBYTE) return t("RecordFiles.sizeBytes", { size: intlStore.formatNumber(bytes) });
    if (bytes < MEGABYTE) {
      return t("RecordFiles.sizeKilobytes", {
        size: intlStore.formatNumber(bytes / KILOBYTE, { maximumFractionDigits: 1 }),
      });
    }
    return t("RecordFiles.sizeMegabytes", {
      size: intlStore.formatNumber(bytes / MEGABYTE, { maximumFractionDigits: 1 }),
    });
  };

  return (
    <ul
      aria-label={t("Mailbox.attachments.label", { count: attachments.length })}
      className="flex flex-wrap gap-2 border-t pt-2"
      data-mail-attachments=""
    >
      {attachments.map((attachment) => (
        <li key={attachment.id} data-mail-attachment={attachment.stored ? "stored" : "missing"}>
          {attachment.stored ? (
            <a
              className="flex max-w-72 items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent"
              download={attachment.fileName}
              href={mailAttachmentPath(attachment.id)}
              title={attachment.fileName}
            >
              <Paperclip aria-hidden className="size-3.5 shrink-0" />

              <span className="truncate">{attachment.fileName}</span>

              <span className="shrink-0 text-muted-foreground">{sizeLabel(attachment.byteSize)}</span>
            </a>
          ) : (
            <span
              className="flex max-w-72 items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground"
              title={t("Mailbox.attachments.notStored")}
            >
              <FileWarning aria-hidden className="size-3.5 shrink-0" />

              <span className="truncate">{attachment.fileName}</span>

              <span className="shrink-0">{t("Mailbox.attachments.notStoredShort")}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
