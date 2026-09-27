"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { WebFormSubmissionDto } from "@/features/webform/submissions/web-form-submission.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { WEB_FORM_SUBMISSION_STATUS_CHIP_COLOR } from "@/features/webform/submissions/web-form-submission-status-colors";

export function useWebFormSubmissionColumns(): ColumnDef<WebFormSubmissionDto>[] {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const columnLabel = useColumnLabel();

  return useMemo<ColumnDef<WebFormSubmissionDto>[]>(
    () => [
      {
        accessorKey: "receivedAt",
        id: "receivedAt",
        header: columnLabel("receivedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.receivedAt)}</span>
        ),
      },
      {
        id: "source",
        header: columnLabel("source"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.sourceName}</span>,
      },
      {
        id: "name",
        header: columnLabel("submitter"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.email ?? row.original.name ?? "-"}</span>,
      },
      {
        id: "status",
        header: columnLabel("status"),
        cell: ({ row }) => (
          <AppChip size="sm" variant={WEB_FORM_SUBMISSION_STATUS_CHIP_COLOR[row.original.status]}>
            {t(`WebFormSubmissions.statuses.${row.original.status}`)}
          </AppChip>
        ),
      },
      {
        id: "lead",
        header: columnLabel("lead"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.leadTitle ?? "-"}</span>,
      },
      {
        id: "error",
        header: columnLabel("error"),
        cell: ({ row }) =>
          row.original.error ? <span className="truncate text-sm text-destructive">{row.original.error}</span> : null,
      },
    ],
    [columnLabel, intlStore, t],
  );
}
