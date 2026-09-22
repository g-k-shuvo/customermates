"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, LeadStatus } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailCustomFieldsSection } from "@/components/entity-detail/entity-detail-custom-fields-section";
import { EntityDetailSection, EntityDetailSectionGroup } from "@/components/entity-detail/entity-detail-section";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormSelect } from "@/components/forms/form-select";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { LEAD_DETAIL_FIELD, LEAD_DETAIL_SECTION } from "./lead-detail-personalization";
import { LeadConvertAction } from "./lead-convert-action";

type Props = {
  layout?: "drawer" | "page";
};

export const LeadDetailView = observer(({ layout = "drawer" }: Props) => {
  const t = useTranslations();
  const { singular } = useEntityTerminology();
  const intlStore = useHydratedIntlStore();
  const { leadDetailStore } = useRootStore();
  const { canManage, isEditingCustomField, customColumns, fetchedEntity } = leadDetailStore;

  const statusItems = Object.values(LeadStatus).map((status) => ({
    value: status,
    label: t(`Common.leadStatuses.${status}`),
  }));

  const ownerName = fetchedEntity?.owner
    ? `${fetchedEntity.owner.firstName} ${fetchedEntity.owner.lastName}`.trim()
    : null;
  const contactName = fetchedEntity?.contact
    ? `${fetchedEntity.contact.firstName} ${fetchedEntity.contact.lastName}`.trim()
    : null;

  const content =
    layout === "drawer" ? (
      <>
        <LeadConvertAction lead={fetchedEntity} />

        <EntityDetailField fieldId={LEAD_DETAIL_FIELD.title}>
          <FormInput autoFocus required id="title" />
        </EntityDetailField>

        <EntityDetailField fieldId={LEAD_DETAIL_FIELD.status}>
          <FormSelect required id="status" items={statusItems} />
        </EntityDetailField>

        <EntityDetailField fieldId={LEAD_DETAIL_FIELD.value}>
          <FormNumberInput id="value" />
        </EntityDetailField>

        <EntityDetailField fieldId={LEAD_DETAIL_FIELD.labels}>
          <FormInputChips arrayMode id="labels" />
        </EntityDetailField>

        <EntityDetailStaticField
          fieldId={LEAD_DETAIL_FIELD.contactId}
          label={singular(EntityType.contact)}
          value={contactName}
        />

        <EntityDetailStaticField
          fieldId={LEAD_DETAIL_FIELD.organizationId}
          label={singular(EntityType.organization)}
          value={fetchedEntity?.organization?.name ?? null}
        />

        <EntityDetailStaticField
          fieldId={LEAD_DETAIL_FIELD.source}
          label={t("LeadDetail.source")}
          value={fetchedEntity?.source?.name ?? fetchedEntity?.sourceOrigin ?? null}
        />

        <EntityDetailStaticField
          fieldId={LEAD_DETAIL_FIELD.ownerUserId}
          label={t("LeadDetail.owner")}
          value={ownerName}
        />

        <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />
      </>
    ) : (
      <EntityDetailSectionGroup>
        <LeadConvertAction lead={fetchedEntity} />

        <EntityDetailSection label={t("EntityDetail.sections.base")} sectionId={LEAD_DETAIL_SECTION.base}>
          <EntityDetailField fieldId={LEAD_DETAIL_FIELD.title}>
            <FormInput
              autoFocus
              required
              id="title"
              labelEndAddon={
                <EntityDetailFieldActions fieldId={LEAD_DETAIL_FIELD.title} label={t("Common.inputs.title")} />
              }
            />
          </EntityDetailField>

          <EntityDetailField fieldId={LEAD_DETAIL_FIELD.status}>
            <FormSelect required id="status" items={statusItems} />
          </EntityDetailField>

          <EntityDetailField fieldId={LEAD_DETAIL_FIELD.value}>
            <FormNumberInput id="value" />
          </EntityDetailField>

          <EntityDetailField fieldId={LEAD_DETAIL_FIELD.labels}>
            <FormInputChips arrayMode id="labels" />
          </EntityDetailField>

          <EntityDetailStaticField
            fieldId={LEAD_DETAIL_FIELD.createdAt}
            label={t("EntityDetail.fields.createdAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.createdAt)}
          />

          <EntityDetailStaticField
            fieldId={LEAD_DETAIL_FIELD.updatedAt}
            label={t("EntityDetail.fields.updatedAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.updatedAt)}
          />
        </EntityDetailSection>

        <EntityDetailSection label={t("EntityDetail.sections.relations")} sectionId={LEAD_DETAIL_SECTION.relations}>
          <EntityDetailStaticField
            fieldId={LEAD_DETAIL_FIELD.contactId}
            label={singular(EntityType.contact)}
            value={contactName}
          />

          <EntityDetailStaticField
            fieldId={LEAD_DETAIL_FIELD.organizationId}
            label={singular(EntityType.organization)}
            value={fetchedEntity?.organization?.name ?? null}
          />

          <EntityDetailStaticField
            fieldId={LEAD_DETAIL_FIELD.source}
            label={t("LeadDetail.source")}
            value={fetchedEntity?.source?.name ?? fetchedEntity?.sourceOrigin ?? null}
          />

          <EntityDetailStaticField
            fieldId={LEAD_DETAIL_FIELD.ownerUserId}
            label={t("LeadDetail.owner")}
            value={ownerName}
          />
        </EntityDetailSection>

        <EntityDetailCustomFieldsSection
          canManage={canManage}
          columns={customColumns}
          entityType={EntityType.lead}
          isEditing={isEditingCustomField}
          sectionId={LEAD_DETAIL_SECTION.customFields}
        />
      </EntityDetailSectionGroup>
    );

  return (
    <EntityDetailBody entityType={EntityType.lead} layout={layout} store={leadDetailStore} titleKey="LeadDetail.title">
      {content}
    </EntityDetailBody>
  );
});
