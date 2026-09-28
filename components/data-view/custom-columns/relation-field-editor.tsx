"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { RelationTargetEntityType } from "@/features/custom-column/relation-target";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, Resource } from "@/generated/prisma";

import { getContactsAction } from "@/app/[locale]/(protected)/contacts/actions";
import { getOrganizationsAction } from "@/app/[locale]/(protected)/organizations/actions";
import { getDealsAction } from "@/app/[locale]/(protected)/deals/actions";
import { AppChip } from "@/components/chip/app-chip";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { SelectionValueSkeleton } from "@/components/forms/selection-loading";
import { useRootStore } from "@/core/stores/root-store.provider";

import { RelationFieldValue } from "./relation-field-value";

type RelationOption = { id: string; name?: string };
type SearchParams = { searchTerm?: string };

const SEARCH_BY_TARGET: Record<RelationTargetEntityType, (params: SearchParams) => Promise<GetResult<RelationOption>>> =
  {
    [EntityType.contact]: (params) =>
      getContactsAction(params).then((result) => ({
        ...result,
        items: result.items.map((contact) => ({
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`.trim(),
        })),
      })),
    [EntityType.organization]: (params) =>
      getOrganizationsAction(params).then((result) => ({
        ...result,
        items: result.items.map((organization) => ({ id: organization.id, name: organization.name })),
      })),
    [EntityType.deal]: (params) =>
      getDealsAction(params).then((result) => ({
        ...result,
        items: result.items.map((deal) => ({ id: deal.id, name: deal.name })),
      })),
  };

const RESOURCE_BY_TARGET: Record<RelationTargetEntityType, Resource> = {
  [EntityType.contact]: Resource.contacts,
  [EntityType.organization]: Resource.organizations,
  [EntityType.deal]: Resource.deals,
};

type Props = {
  targetEntityType: RelationTargetEntityType;
  id: string;
  label: string | null;
  value: string | undefined;
};

export const RelationFieldEditor = observer(({ targetEntityType, id, label, value }: Props) => {
  const t = useTranslations();
  const entityHref = useEntityHref();
  const { relationLabelStore, userStore } = useRootStore();

  if (!userStore.canAccess(RESOURCE_BY_TARGET[targetEntityType]))
    return <RelationFieldValue targetEntityType={targetEntityType} value={value ?? ""} />;

  const currentLabel = value ? relationLabelStore.label(targetEntityType, value) : undefined;
  const items = value
    ? [{ id: value, name: currentLabel === null ? t("DataView.relationNotAccessible") : currentLabel }]
    : [];

  return (
    <FormAutocomplete<RelationOption>
      chipHref={(key) => entityHref(targetEntityType, key)}
      getItems={SEARCH_BY_TARGET[targetEntityType]}
      id={id}
      items={items}
      label={label}
      renderValue={(values) =>
        values.map((entry) =>
          entry.data?.name === undefined ? (
            <SelectionValueSkeleton key={entry.key} />
          ) : (
            <AppChip key={entry.key}>{entry.data.name}</AppChip>
          ),
        )
      }
      onSelectionDataChange={(selected) => {
        for (const entry of selected)
          if (entry.data?.name) relationLabelStore.remember(targetEntityType, entry.key, entry.data.name);
      }}
    >
      {(item) => FormAutocompleteItem({ children: item.name ?? "", textValue: item.name ?? "" })}
    </FormAutocomplete>
  );
});
