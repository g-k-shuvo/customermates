"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { LeadDto } from "@/features/leads/lead.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { standardTailColumns } from "@/components/data-view/standard-columns";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { LEAD_STATUS_CHIP_COLOR } from "./lead-status-colors";

export function useLeadColumns(): ColumnDef<LeadDto>[] {
  const { leadsStore, userModalStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const t = useTranslations();

  return useMemo<ColumnDef<LeadDto>[]>(
    () => [
      {
        id: "title",
        cell: ({ row }) => <span className="truncate text-sm">{row.original.title}</span>,
      },
      {
        id: "status",
        cell: ({ row }) => (
          <AppChip size="sm" variant={LEAD_STATUS_CHIP_COLOR[row.original.status]}>
            {t(`Common.leadStatuses.${row.original.status}`)}
          </AppChip>
        ),
      },
      {
        id: "contact",
        cell: ({ row }) => (
          <AvatarStack
            avatarHref={(contact) => entityHref(EntityType.contact, contact.id)}
            items={row.original.contact ? [row.original.contact] : []}
            onAvatarClick={(contact) => openEntity(EntityType.contact, contact.id)}
          />
        ),
      },
      {
        id: "organization",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(organization) => entityHref(EntityType.organization, organization.id)}
            items={
              row.original.organization
                ? [{ id: row.original.organization.id, label: row.original.organization.name }]
                : []
            }
            size="sm"
          />
        ),
      },
      {
        id: "source",
        cell: ({ row }) => (
          <span className="truncate text-sm">{row.original.source?.name ?? row.original.sourceOrigin}</span>
        ),
      },
      {
        id: "value",
        cell: ({ row }) => (
          <span suppressHydrationWarning className="text-sm">
            {row.original.value === null ? "" : intlStore.formatCurrency(row.original.value)}
          </span>
        ),
      },
      {
        id: "owner",
        cell: ({ row }) => (
          <AvatarStack items={row.original.owner ? [row.original.owner] : []} onAvatarClick={() => undefined} />
        ),
      },
      ...standardTailColumns({
        store: leadsStore,
        intlStore,
        userModalStore,
      }),
    ],
    [entityHref, intlStore, leadsStore, leadsStore.customColumns, openEntity, t, userModalStore],
  );
}
