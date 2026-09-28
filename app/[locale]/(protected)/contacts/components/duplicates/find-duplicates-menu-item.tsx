"use client";

import { Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { DuplicateEntityType } from "@/features/duplicates/duplicate.schema";

import { Action, EntityType } from "@/generated/prisma";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";
import { DUPLICATE_RESOURCE } from "@/features/duplicates/duplicate-access";

export const DUPLICATES_PATH: Record<DuplicateEntityType, string> = {
  [EntityType.contact]: "/contacts/duplicates",
  [EntityType.organization]: "/organizations/duplicates",
};

export const FindDuplicatesMenuItem = observer(({ entityType }: { entityType: DuplicateEntityType }) => {
  const t = useTranslations();
  const router = useRouter();
  const { userStore } = useRootStore();

  if (!userStore.can(DUPLICATE_RESOURCE[entityType], Action.readAll)) return null;

  return (
    <DropdownMenuItem onSelect={() => router.push(DUPLICATES_PATH[entityType])}>
      <Users className="size-4" />

      {t("Duplicates.menu")}
    </DropdownMenuItem>
  );
});
