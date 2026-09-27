"use client";

import type { RecordFileEntityType } from "@/features/record-files/record-file.schema";
import type { RecordDocumentDto, RecordDocumentListDto } from "@/features/record-documents/record-document.schema";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, FileSignature, FileText, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { RecordDocumentFileKind, RecordDocumentStatus } from "@/generated/prisma";

import {
  completeRecordDocumentFileAction,
  createRecordDocumentAction,
  createSignedCopyUploadAction,
  deleteRecordDocumentAction,
  getRecordDocumentDownloadAction,
  getRecordDocumentsAction,
  refreshSignatureAction,
  updateRecordDocumentAction,
  voidSignatureAction,
} from "@/app/[locale]/(protected)/record-documents/actions";
import { SendForSignatureModal } from "@/components/entity-detail/send-for-signature-modal";
import { PageState } from "@/components/page-state/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { isEnvelopeActive } from "@/features/record-documents/signing/active-envelope";

type Props = {
  entityType: RecordFileEntityType;
  recordId: string;
  canEdit: boolean;
};

type PanelState = { status: "loading" } | { status: "ready"; list: RecordDocumentListDto } | { status: "error" };

type Upload = { key: string; name: string };

type PresignedPut = { url: string; method: "PUT"; headers: Record<string, string> };

const STATUSES = Object.values(RecordDocumentStatus);

const SENDABLE_STATUSES: ReadonlySet<RecordDocumentStatus> = new Set([
  RecordDocumentStatus.draft,
  RecordDocumentStatus.declined,
  RecordDocumentStatus.voided,
]);

const STATUS_BADGE = {
  draft: "secondary",
  sent: "info",
  completed: "success",
  declined: "destructive",
  voided: "outline",
} as const satisfies Record<RecordDocumentStatus, string>;

const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;

const putPdf = (upload: PresignedPut, file: File) =>
  fetch(upload.url, { method: upload.method, headers: upload.headers, body: file }).catch(() => null);

export function EntityDocumentsPanel({ entityType, recordId, canEdit }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { showConfirmation, showDeleteConfirmation } = useDeleteConfirmation();
  const addInputRef = useRef<HTMLInputElement>(null);
  const signedInputRef = useRef<HTMLInputElement>(null);
  const signedTargetRef = useRef<RecordDocumentDto | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameFocusRef = useRef<string | null>(null);
  const renameCancelledRef = useRef(false);
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [signingTarget, setSigningTarget] = useState<RecordDocumentDto | null>(null);

  const load = useCallback(async () => {
    const result = await getRecordDocumentsAction({ entityType, recordId });
    setState(result.ok ? { status: "ready", list: result.data } : { status: "error" });
  }, [entityType, recordId]);

  useEffect(() => {
    setState({ status: "loading" });
    runUserAction(load);
  }, [load]);

  const statusLabel = (status: RecordDocumentStatus) => {
    switch (status) {
      case RecordDocumentStatus.draft:
        return t("RecordDocuments.status.draft");
      case RecordDocumentStatus.sent:
        return t("RecordDocuments.status.sent");
      case RecordDocumentStatus.completed:
        return t("RecordDocuments.status.completed");
      case RecordDocumentStatus.declined:
        return t("RecordDocuments.status.declined");
      case RecordDocumentStatus.voided:
        return t("RecordDocuments.status.voided");
    }
  };

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

  const tracked = async (file: File, work: () => Promise<void>) => {
    const key = `${file.name}:${file.size}:${file.lastModified}:${Date.now()}`;
    setUploads((current) => [...current, { key, name: file.name }]);
    try {
      await work();
    } finally {
      setUploads((current) => current.filter((upload) => upload.key !== key));
    }
  };

  const addOne = (file: File) =>
    tracked(file, async () => {
      const created = await createRecordDocumentAction({
        entityType,
        recordId,
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size,
      });
      if (!created.ok) {
        toastZodErrorTree(created.error);
        return;
      }

      const sent = await putPdf(created.data.upload, file);
      if (!sent?.ok) {
        toast.error(t("RecordDocuments.addFailed", { name: file.name }));
        return;
      }

      const completed = await completeRecordDocumentFileAction({
        id: created.data.document.id,
        fileId: created.data.file.id,
      });
      if (!completed.ok) {
        toastZodErrorTree(completed.error);
        return;
      }

      toast.success(t("RecordDocuments.added", { name: file.name }));
    });

  const addAll = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    runUserAction(async () => {
      for (const file of picked) await addOne(file);
      await load();
    });
  };

  const attachSigned = (document: RecordDocumentDto, file: File) =>
    runUserAction(async () => {
      await tracked(file, async () => {
        const created = await createSignedCopyUploadAction({
          id: document.id,
          fileName: file.name,
          contentType: file.type,
          byteSize: file.size,
        });
        if (!created.ok) {
          toastZodErrorTree(created.error);
          return;
        }

        const sent = await putPdf(created.data.upload, file);
        if (!sent?.ok) {
          toast.error(t("RecordDocuments.addFailed", { name: file.name }));
          return;
        }

        const completed = await completeRecordDocumentFileAction({ id: document.id, fileId: created.data.file.id });
        if (!completed.ok) {
          toastZodErrorTree(completed.error);
          return;
        }

        toast.success(t("RecordDocuments.signedAttached", { title: document.title }));
      });
      await load();
    });

  const open = (document: RecordDocumentDto, version?: RecordDocumentFileKind) =>
    runUserAction(async () => {
      const link = await getRecordDocumentDownloadAction({ id: document.id, version });
      if (!link.ok) {
        toastZodErrorTree(link.error);
        return;
      }

      window.open(link.data.url, "_blank", "noopener,noreferrer");
    });

  const changeStatus = (document: RecordDocumentDto, status: RecordDocumentStatus) =>
    runUserAction(async () => {
      if (status === document.status) return;

      const result = await updateRecordDocumentAction({ id: document.id, status });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      toast.success(t("RecordDocuments.statusChanged", { title: document.title, status: statusLabel(status) }));
      await load();
    });

  const rename = (document: RecordDocumentDto, value: string) =>
    runUserAction(async () => {
      setRenamingId(null);
      const title = value.trim();
      if (title === "" || title === document.title) return;

      const result = await updateRecordDocumentAction({ id: document.id, title });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      toast.success(t("RecordDocuments.renamed"));
      await load();
    });

  const remove = (document: RecordDocumentDto) =>
    showDeleteConfirmation(async () => {
      const result = await deleteRecordDocumentAction({ id: document.id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      toast.success(t("RecordDocuments.deleted", { title: document.title }));
      await load();
      return true;
    }, document.title);

  const startRename = (document: RecordDocumentDto) => {
    renameCancelledRef.current = false;
    renameFocusRef.current = document.id;
    setRenamingId(document.id);
  };

  const refreshSignature = (document: RecordDocumentDto) =>
    runUserAction(async () => {
      const result = await refreshSignatureAction({ id: document.id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }

      toast.success(t("RecordDocuments.signature.refreshed", { title: document.title }));
      await load();
    });

  const cancelSignature = (document: RecordDocumentDto) =>
    showConfirmation({
      title: t("RecordDocuments.signature.cancelTitle"),
      message: t("RecordDocuments.signature.cancelMessage", { title: document.title }),
      confirmLabel: t("RecordDocuments.signature.cancelConfirm"),
      confirmVariant: "destructive",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const result = await voidSignatureAction({ id: document.id });
        if (!result.ok) {
          toastZodErrorTree(result.error);
          return false;
        }

        await load();
        return true;
      },
    });

  const signatureProgress = (document: RecordDocumentDto) => {
    if (!document.signature) return null;

    const total = document.signature.recipients.length;
    const signed = document.signature.recipients.filter((recipient) => recipient.status === "completed").length;
    const progress = total > 0 ? t("RecordDocuments.signature.progress", { signed, total }) : null;

    if (isEnvelopeActive(document.signature.status)) {
      return progress
        ? `${t("RecordDocuments.signature.waiting")} · ${progress}`
        : t("RecordDocuments.signature.waiting");
    }

    return progress;
  };

  const pickSignedCopy = (document: RecordDocumentDto) => {
    signedTargetRef.current = document;
    signedInputRef.current?.click();
  };

  if (state.status === "loading")
    return <p className="p-4 text-sm text-muted-foreground">{t("RecordDocuments.loading")}</p>;

  if (state.status === "error") {
    return (
      <PageState
        description={t("RecordDocuments.loadErrorDescription")}
        state="error"
        title={t("RecordDocuments.loadErrorTitle")}
      />
    );
  }

  const { documents, storageConfigured, signingConfigured, maxUploadBytes } = state.list;
  const acceptsUploads = canEdit && storageConfigured;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-documents-panel="">
      {storageConfigured ? (
        acceptsUploads && (
          <div className="flex items-center justify-between gap-3 border-b p-3">
            <p className="text-xs text-muted-foreground">
              {t("RecordDocuments.addHint", { size: sizeLabel(maxUploadBytes) })}
            </p>

            <Button size="sm" type="button" variant="secondary" onClick={() => addInputRef.current?.click()}>
              <FilePlus2 aria-hidden className="size-4" />

              {t("RecordDocuments.add")}
            </Button>

            <input
              ref={addInputRef}
              multiple
              accept="application/pdf,.pdf"
              aria-label={t("RecordDocuments.add")}
              className="hidden"
              data-documents-input=""
              type="file"
              onChange={(event) => {
                addAll(event.target.files);
                event.target.value = "";
              }}
            />

            <input
              ref={signedInputRef}
              accept="application/pdf,.pdf"
              aria-label={t("RecordDocuments.uploadSigned")}
              className="hidden"
              data-documents-signed-input=""
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                const target = signedTargetRef.current;
                event.target.value = "";
                if (file && target) attachSigned(target, file);
              }}
            />
          </div>
        )
      ) : (
        <p className="border-b p-3 text-xs text-muted-foreground">{t("RecordDocuments.notConfigured")}</p>
      )}

      {uploads.length > 0 && (
        <ul aria-live="polite" className="border-b">
          {uploads.map((upload) => (
            <li key={upload.key} className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />

              <span className="truncate">{t("RecordDocuments.adding", { name: upload.name })}</span>
            </li>
          ))}
        </ul>
      )}

      {documents.length === 0 && uploads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <FileSignature aria-hidden="true" className="size-6 text-muted-foreground" />

          <p className="text-sm font-medium">{t("RecordDocuments.emptyTitle")}</p>

          <p className="text-sm text-muted-foreground">
            {acceptsUploads ? t("RecordDocuments.emptyDescription") : t("RecordDocuments.emptyReadOnly")}
          </p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-documents-list="">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              data-document-row=""
              data-document-status={document.status}
            >
              {document.signed ? (
                <FileSignature aria-hidden className="size-5 shrink-0 text-success" />
              ) : (
                <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {renamingId === document.id ? (
                  <Input
                    ref={renameInputRef}
                    autoFocus
                    aria-label={t("RecordDocuments.renameLabel", { title: document.title })}
                    className="h-8"
                    data-document-title-input=""
                    defaultValue={document.title}
                    maxLength={200}
                    onBlur={(event) => {
                      if (renameCancelledRef.current) {
                        renameCancelledRef.current = false;
                        return;
                      }
                      rename(document, event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        renameCancelledRef.current = true;
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    aria-label={t("RecordDocuments.open", { title: document.title })}
                    className="truncate text-left text-sm font-medium hover:underline"
                    disabled={!storageConfigured}
                    title={document.title}
                    type="button"
                    onClick={() => open(document)}
                  >
                    {document.title}
                  </button>
                )}

                <span className="truncate text-xs text-muted-foreground">
                  {document.createdBy
                    ? t("RecordDocuments.metaAdded", {
                        name: `${document.createdBy.firstName} ${document.createdBy.lastName}`.trim(),
                        date: intlStore.formatNumericalShortDateTime(document.createdAt),
                      })
                    : t("RecordDocuments.metaAddedWithoutName", {
                        date: intlStore.formatNumericalShortDateTime(document.createdAt),
                      })}

                  {document.signed && <span className="text-success"> · {t("RecordDocuments.signedCopy")}</span>}
                </span>

                {document.signature && (
                  <span
                    className="truncate text-xs text-muted-foreground"
                    data-document-signature=""
                    title={document.signature.recipients.map((recipient) => recipient.name).join(", ")}
                  >
                    {signatureProgress(document)}
                  </span>
                )}
              </div>

              {canEdit ? (
                <Select
                  disabled={isEnvelopeActive(document.signature?.status)}
                  value={document.status}
                  onValueChange={(value) => changeStatus(document, value as RecordDocumentStatus)}
                >
                  <SelectTrigger
                    aria-label={t("RecordDocuments.statusLabel", { title: document.title })}
                    className="w-auto shrink-0"
                    data-document-status-select=""
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent align="end">
                    {STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge className="shrink-0" variant={STATUS_BADGE[document.status]}>
                  {statusLabel(document.status)}
                </Badge>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t("RecordDocuments.actions", { title: document.title })}
                    data-document-actions=""
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <MoreHorizontal aria-hidden className="size-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  onCloseAutoFocus={(event) => {
                    if (renameFocusRef.current !== document.id) return;
                    event.preventDefault();
                    renameFocusRef.current = null;
                    renameInputRef.current?.focus();
                  }}
                >
                  <DropdownMenuItem
                    disabled={!storageConfigured}
                    onSelect={() => open(document, RecordDocumentFileKind.original)}
                  >
                    {t("RecordDocuments.openOriginal")}
                  </DropdownMenuItem>

                  {document.signed && (
                    <DropdownMenuItem
                      disabled={!storageConfigured}
                      onSelect={() => open(document, RecordDocumentFileKind.signed)}
                    >
                      {t("RecordDocuments.openSigned")}
                    </DropdownMenuItem>
                  )}

                  {canEdit && (
                    <>
                      <DropdownMenuSeparator />

                      {signingConfigured &&
                        SENDABLE_STATUSES.has(document.status) &&
                        !isEnvelopeActive(document.signature?.status) && (
                          <DropdownMenuItem disabled={!storageConfigured} onSelect={() => setSigningTarget(document)}>
                            {t("RecordDocuments.signature.sendAction")}
                          </DropdownMenuItem>
                        )}

                      {signingConfigured && isEnvelopeActive(document.signature?.status) && (
                        <>
                          <DropdownMenuItem onSelect={() => refreshSignature(document)}>
                            {t("RecordDocuments.signature.refresh")}
                          </DropdownMenuItem>

                          <DropdownMenuItem variant="destructive" onSelect={() => cancelSignature(document)}>
                            {t("RecordDocuments.signature.cancel")}
                          </DropdownMenuItem>
                        </>
                      )}

                      <DropdownMenuItem
                        disabled={!acceptsUploads || isEnvelopeActive(document.signature?.status)}
                        onSelect={() => pickSignedCopy(document)}
                      >
                        {t("RecordDocuments.uploadSigned")}
                      </DropdownMenuItem>

                      <DropdownMenuItem onSelect={() => startRename(document)}>
                        {t("RecordDocuments.rename")}
                      </DropdownMenuItem>

                      <DropdownMenuItem variant="destructive" onSelect={() => remove(document)}>
                        {t("RecordDocuments.delete")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {signingConfigured && (
        <SendForSignatureModal
          document={signingTarget}
          entityType={entityType}
          recordId={recordId}
          onClose={() => setSigningTarget(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
