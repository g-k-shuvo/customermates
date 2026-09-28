"use client";

import type { RelationTargetEntityType } from "@/features/custom-column/relation-target";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  targetEntityType: RelationTargetEntityType;
  value: string;
};

export const RelationFieldValue = observer(({ targetEntityType, value }: Props) => {
  const t = useTranslations();
  const entityHref = useEntityHref();
  const { relationLabelStore } = useRootStore();

  if (!value) return <span />;

  const label = relationLabelStore.label(targetEntityType, value);

  if (label === undefined) return <span />;

  if (label === null)
    return <span className="block truncate text-muted-foreground">{t("DataView.relationNotAccessible")}</span>;

  return (
    <AppChipStack chipHref={(item) => entityHref(targetEntityType, item.id)} items={[{ id: value, label }]} size="sm" />
  );
});
