"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, Resource } from "@/generated/prisma";

import { createContactByNameAction, getContactsAction } from "@/app/[locale]/(protected)/contacts/actions";
import {
  createOrganizationByNameAction,
  getOrganizationsAction,
} from "@/app/[locale]/(protected)/organizations/actions";
import { getUsersAction } from "@/app/[locale]/(protected)/company/actions";
import { AppChip } from "@/components/chip/app-chip";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "@/components/entity-detail/entity-detail-fields";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { LEAD_DETAIL_FIELD } from "./lead-detail-personalization";

function fullName(person: { firstName: string; lastName: string } | null | undefined): string | null {
  return person ? `${person.firstName} ${person.lastName}`.trim() : null;
}

function fieldAddons(fieldId: string, label: string) {
  return {
    controlStartAddon: <EntityDetailFieldDragHandle label={label} />,
    labelEndAddon: <EntityDetailFieldActions fieldId={fieldId} label={label} />,
  };
}

export const LeadContactField = observer(() => {
  const { singular } = useEntityTerminology();
  const entityHref = useEntityHref();
  const { leadDetailStore, userStore } = useRootStore();
  const contact = leadDetailStore.fetchedEntity?.contact ?? null;
  const fieldId = LEAD_DETAIL_FIELD.contactId;
  const label = singular(EntityType.contact);

  if (!userStore.canAccess(Resource.contacts))
    return <EntityDetailStaticField fieldId={fieldId} label={label} value={fullName(contact)} />;

  return (
    <EntityDetailField fieldId={fieldId}>
      <FormAutocompleteAvatar
        {...fieldAddons(fieldId, label)}
        chipHref={(id) => entityHref(EntityType.contact, id)}
        getItems={getContactsAction}
        id={fieldId}
        items={contact ? [contact] : []}
        label={label}
        onCreate={(name) => createContactByNameAction(name, userStore.user?.id)}
      />
    </EntityDetailField>
  );
});

export const LeadOrganizationField = observer(() => {
  const { singular } = useEntityTerminology();
  const entityHref = useEntityHref();
  const { leadDetailStore, userStore } = useRootStore();
  const organization = leadDetailStore.fetchedEntity?.organization ?? null;
  const fieldId = LEAD_DETAIL_FIELD.organizationId;
  const label = singular(EntityType.organization);

  if (!userStore.canAccess(Resource.organizations))
    return <EntityDetailStaticField fieldId={fieldId} label={label} value={organization?.name ?? null} />;

  return (
    <EntityDetailField fieldId={fieldId}>
      <FormAutocomplete<{ id: string; name: string }>
        {...fieldAddons(fieldId, label)}
        chipHref={(id) => entityHref(EntityType.organization, id)}
        getItems={getOrganizationsAction}
        id={fieldId}
        items={organization ? [organization] : []}
        label={label}
        renderValue={(values) => values.map((value) => <AppChip key={value.key}>{value.data?.name}</AppChip>)}
        onCreate={(name) => createOrganizationByNameAction(name, userStore.user?.id)}
      >
        {(item) => FormAutocompleteItem({ children: item.name, textValue: item.name })}
      </FormAutocomplete>
    </EntityDetailField>
  );
});

export const LeadOwnerField = observer(() => {
  const t = useTranslations();
  const { leadDetailStore, userModalStore, userStore } = useRootStore();
  const owner = leadDetailStore.fetchedEntity?.owner ?? null;
  const fieldId = LEAD_DETAIL_FIELD.ownerUserId;
  const label = t("LeadDetail.owner");

  if (!userStore.canAccess(Resource.users))
    return <EntityDetailStaticField fieldId={fieldId} label={label} value={fullName(owner)} />;

  const self = userStore.user;
  const items = owner ? [owner] : self && leadDetailStore.form.ownerUserId === self.id ? [self] : [];

  return (
    <EntityDetailField fieldId={fieldId}>
      <FormAutocompleteAvatar
        {...fieldAddons(fieldId, label)}
        getItems={getUsersAction}
        id={fieldId}
        items={items}
        label={label}
        readOnly={!leadDetailStore.canReadAll}
        onChipClick={(id) => runUserAction(() => userModalStore.loadById(id))}
      />
    </EntityDetailField>
  );
});
