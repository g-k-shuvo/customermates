"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { WebFormSourceDto } from "@/features/webform/webform-source.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export function useWebFormSourceColumns(): ColumnDef<WebFormSourceDto>[] {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();

  return useMemo<ColumnDef<WebFormSourceDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => <span className="truncate text-sm">{row.original.name}</span>,
      },
      {
        id: "endpointPath",
        header: t("WebFormSourcesCard.endpoint"),
        cell: ({ row }) => <code className="select-text truncate font-mono text-xs">{row.original.endpointPath}</code>,
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) =>
          row.original.active ? (
            <AppChip size="sm" variant="success">
              {t("WebFormSourceModal.active")}
            </AppChip>
          ) : (
            <AppChip size="sm" variant="secondary">
              {t("WebFormSourceModal.inactive")}
            </AppChip>
          ),
      },
      {
        id: "defaultLabels",
        header: t("WebFormSourceModal.defaultLabels"),
        cell: ({ row }) => (
          <AppChipStack items={row.original.defaultLabels.map((label) => ({ id: label, label }))} size="sm" />
        ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: t("Common.table.columns.updatedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.updatedAt)}</span>
        ),
      },
    ],
    [intlStore, t],
  );
}
