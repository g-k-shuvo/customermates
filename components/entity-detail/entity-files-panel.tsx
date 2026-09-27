"use client";

import type { DragEvent } from "react";
import type {
  RecordFileDto,
  RecordFileEntityType,
  RecordFileListDto,
} from "@/features/record-files/record-file.schema";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  completeRecordFileUploadAction,
  createRecordFileUploadAction,
  deleteRecordFileAction,
  getRecordFileDownloadAction,
  getRecordFilesAction,
} from "@/app/[locale]/(protected)/record-files/actions";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { dispositionFor } from "@/core/storage/upload-policy";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { cn } from "@/core/utils/cn";

type Props = {
  entityType: RecordFileEntityType;
  recordId: string;
  canEdit: boolean;
};

type PanelState = { status: "loading" } | { status: "ready"; list: RecordFileListDto } | { status: "error" };

type Upload = { key: string; name: string };

const KILOBYTE = 1024;
const MEGABYTE = 1024 * 1024;

export function EntityFilesPanel({ entityType, recordId, canEdit }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    const result = await getRecordFilesAction({ entityType, recordId });
    setState(result.ok ? { status: "ready", list: result.data } : { status: "error" });
  }, [entityType, recordId]);

  useEffect(() => {
    setState({ status: "loading" });
    runUserAction(load);
  }, [load]);

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

  const uploadOne = async (file: File) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    setUploads((current) => [...current, { key, name: file.name }]);

    try {
      const created = await createRecordFileUploadAction({
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

      const sent = await fetch(created.data.upload.url, {
        method: created.data.upload.method,
        headers: created.data.upload.headers,
        body: file,
      }).catch(() => null);
      if (!sent?.ok) {
        toast.error(t("RecordFiles.uploadFailed", { name: file.name }));
        return;
      }

      const completed = await completeRecordFileUploadAction({ id: created.data.file.id });
      if (!completed.ok) {
        toastZodErrorTree(completed.error);
        return;
      }

      toast.success(t("RecordFiles.uploaded", { name: file.name }));
    } finally {
      setUploads((current) => current.filter((upload) => upload.key !== key));
    }
  };

  const uploadAll = (files: FileList | File[] | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    runUserAction(async () => {
      for (const file of picked) await uploadOne(file);
      await load();
    });
  };

  const download = (file: RecordFileDto) =>
    runUserAction(async () => {
      const link = await getRecordFileDownloadAction({ id: file.id });
      if (!link.ok) {
        toastZodErrorTree(link.error);
        return;
      }

      if (dispositionFor(file.contentType) === "inline") window.open(link.data.url, "_blank", "noopener,noreferrer");
      else window.location.assign(link.data.url);
    });

  const remove = (file: RecordFileDto) =>
    showDeleteConfirmation(async () => {
      const result = await deleteRecordFileAction({ id: file.id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      toast.success(t("RecordFiles.deleted", { name: file.fileName }));
      await load();
      return true;
    }, file.fileName);

  if (state.status === "loading")
    return <p className="p-4 text-sm text-muted-foreground">{t("RecordFiles.loading")}</p>;

  if (state.status === "error") {
    return (
      <PageState
        description={t("RecordFiles.loadErrorDescription")}
        state="error"
        title={t("RecordFiles.loadErrorTitle")}
      />
    );
  }

  const { files, storageConfigured, maxUploadBytes } = state.list;
  const acceptsUploads = canEdit && storageConfigured;

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptsUploads) return;
    event.preventDefault();
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptsUploads) return;
    event.preventDefault();
    setDragging(false);
    uploadAll(event.dataTransfer.files);
  };

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", dragging && "bg-accent/40 ring-2 ring-primary/40 ring-inset")}
      data-files-panel=""
      onDragLeave={() => setDragging(false)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {storageConfigured ? (
        acceptsUploads && (
          <div className="flex items-center justify-between gap-3 border-b p-3">
            <p className="text-xs text-muted-foreground">
              {t("RecordFiles.dropHint", { size: sizeLabel(maxUploadBytes) })}
            </p>

            <Button size="sm" type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden className="size-4" />

              {t("RecordFiles.upload")}
            </Button>

            <input
              ref={inputRef}
              multiple
              aria-label={t("RecordFiles.upload")}
              className="hidden"
              data-files-input=""
              type="file"
              onChange={(event) => {
                uploadAll(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        )
      ) : (
        <p className="border-b p-3 text-xs text-muted-foreground">{t("RecordFiles.notConfigured")}</p>
      )}

      {uploads.length > 0 && (
        <ul aria-live="polite" className="border-b">
          {uploads.map((upload) => (
            <li key={upload.key} className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />

              <span className="truncate">{t("RecordFiles.uploading", { name: upload.name })}</span>
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 && uploads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Paperclip aria-hidden="true" className="size-6 text-muted-foreground" />

          <p className="text-sm font-medium">{t("RecordFiles.emptyTitle")}</p>

          <p className="text-sm text-muted-foreground">
            {acceptsUploads ? t("RecordFiles.emptyDescription") : t("RecordFiles.emptyReadOnly")}
          </p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-files-list="">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0" data-file-row="">
              <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <button
                  className="truncate text-left text-sm font-medium hover:underline"
                  disabled={!storageConfigured}
                  title={file.fileName}
                  type="button"
                  onClick={() => download(file)}
                >
                  {file.fileName}
                </button>

                <span className="truncate text-xs text-muted-foreground">
                  {file.uploadedBy
                    ? t("RecordFiles.meta", {
                        size: sizeLabel(file.byteSize),
                        name: `${file.uploadedBy.firstName} ${file.uploadedBy.lastName}`.trim(),
                        date: intlStore.formatNumericalShortDateTime(file.createdAt),
                      })
                    : t("RecordFiles.metaWithoutUploader", {
                        size: sizeLabel(file.byteSize),
                        date: intlStore.formatNumericalShortDateTime(file.createdAt),
                      })}
                </span>
              </div>

              <Button
                aria-label={t("RecordFiles.download", { name: file.fileName })}
                disabled={!storageConfigured}
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => download(file)}
              >
                <Download aria-hidden className="size-4" />
              </Button>

              {canEdit && (
                <Button
                  aria-label={t("RecordFiles.delete", { name: file.fileName })}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() => remove(file)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
