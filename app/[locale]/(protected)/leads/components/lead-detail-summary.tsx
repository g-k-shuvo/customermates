"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { EntityDetailSummary } from "@/components/entity-detail/entity-detail-summary";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { LEAD_DETAIL_FIELD } from "./lead-detail-personalization";

export const LeadDetailSummary = observer(function LeadDetailSummary() {
  const t = useTranslations();
  const { singular } = useEntityTerminology();
  const intlStore = useHydratedIntlStore();
  const { leadDetailStore } = useRootStore();
  const { fetchedEntity, form, customColumns } = leadDetailStore;

  if (!fetchedEntity) return null;

  const customFieldValues = Array.isArray(form.customFieldValues) ? form.customFieldValues : [];
  const ownerName = fetchedEntity.owner
    ? `${fetchedEntity.owner.firstName} ${fetchedEntity.owner.lastName}`.trim()
    : null;
  const contactName = fetchedEntity.contact
    ? `${fetchedEntity.contact.firstName} ${fetchedEntity.contact.lastName}`.trim()
    : null;

  return (
    <EntityDetailSummary
      customColumns={customColumns}
      customFieldValues={customFieldValues}
      entityId={fetchedEntity.id}
      fields={[
        {
          id: LEAD_DETAIL_FIELD.title,
          label: t("Common.inputs.title"),
          value: form.title,
        },
        {
          id: LEAD_DETAIL_FIELD.status,
          label: t("Common.inputs.status"),
          value: t(`Common.leadStatuses.${fetchedEntity.status}`),
        },
        {
          id: LEAD_DETAIL_FIELD.value,
          label: t("Common.inputs.value"),
          value: fetchedEntity.value === null ? null : intlStore.formatCurrency(fetchedEntity.value),
        },
        {
          id: LEAD_DETAIL_FIELD.contactId,
          label: singular(EntityType.contact),
          value: contactName,
        },
        {
          id: LEAD_DETAIL_FIELD.organizationId,
          label: singular(EntityType.organization),
          value: fetchedEntity.organization?.name ?? null,
        },
        {
          id: LEAD_DETAIL_FIELD.source,
          label: t("LeadDetail.source"),
          value: fetchedEntity.source?.name ?? fetchedEntity.sourceOrigin,
        },
        {
          id: LEAD_DETAIL_FIELD.ownerUserId,
          label: t("LeadDetail.owner"),
          value: ownerName,
        },
        {
          id: LEAD_DETAIL_FIELD.createdAt,
          label: t("EntityDetail.fields.createdAt"),
          value: intlStore.formatRelativeTime(fetchedEntity.createdAt),
        },
        {
          id: LEAD_DETAIL_FIELD.updatedAt,
          label: t("EntityDetail.fields.updatedAt"),
          value: intlStore.formatRelativeTime(fetchedEntity.updatedAt),
        },
      ]}
    />
  );
});
