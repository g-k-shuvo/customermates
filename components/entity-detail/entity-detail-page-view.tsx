"use client";

import type { EntityType } from "@/generated/prisma";
import type { ActivitiesResult } from "@/ee/messaging/activities/activities.schema";
import type { EntityDetailInitial } from "@/components/entity-detail/entity-detail-layout";
import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";
import type { RecordFileEntityType } from "@/features/record-files/record-file.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Action, Resource } from "@/generated/prisma";

import { EntityDetailLayout } from "@/components/entity-detail/entity-detail-layout";
import { ENTITY_DETAIL } from "@/components/entity-detail/entity-detail.registry";
import { EntityTimelinePanel } from "@/features/messaging/activities/activities-panel";
import { EntityEmailsPanel } from "@/components/entity-detail/entity-emails-panel";
import { EntityFilesPanel } from "@/components/entity-detail/entity-files-panel";
import { EntityDocumentsPanel } from "@/components/entity-detail/entity-documents-panel";
import { EntityInvoicesPanel } from "@/components/entity-detail/entity-invoices-panel";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { EntityDetailPersonalizationProvider } from "@/components/entity-detail/entity-detail-personalization";
import { useEntityDetailServerSnapshot } from "@/components/entity-detail/use-entity-detail-server-snapshot";

type Props = {
  entityType: EntityType;
  id: string;
  entityInitial?: EntityDetailInitial | null;
  timelineInitial: ActivitiesResult;
  personalizationInitial?: P13nEntry | null;
};

function emailsPanelFor(entityType: EntityType, id: string) {
  if (entityType === "contact") return <EntityEmailsPanel contactId={id} />;
  if (entityType === "deal") return <EntityEmailsPanel dealId={id} />;
  if (entityType === "organization") return <EntityEmailsPanel organizationId={id} />;
  if (entityType === "lead") return <EntityEmailsPanel leadId={id} />;

  return undefined;
}

function invoicesPanelFor(entityType: EntityType, id: string, canCreate: boolean, canEditBilling: boolean) {
  if (entityType === "deal") return <EntityInvoicesPanel canCreate={canCreate} dealId={id} />;
  if (entityType === "organization")
    return <EntityInvoicesPanel canCreate={canCreate} canEditBilling={canEditBilling} organizationId={id} />;

  return undefined;
}

const FILE_RESOURCE: Partial<Record<EntityType, Resource>> = {
  contact: Resource.contacts,
  organization: Resource.organizations,
  deal: Resource.deals,
};

export const EntityDetailPageView = observer(
  ({ entityType, id, entityInitial, timelineInitial, personalizationInitial }: Props) => {
    const t = useTranslations();
    const { singular } = useEntityTerminology();
    const root = useRootStore();
    const config = ENTITY_DETAIL[entityType];
    const store = config.store(root);
    const serverSnapshotApplied = useEntityDetailServerSnapshot(store, id, entityInitial);
    const Master = config.DetailView;
    const Summary = config.DetailSummary;
    const requestHasAuthoritativeColumns =
      store.requestedEntityId === id && (store.entityLoadState === "ready" || store.entityLoadState === "not-found");
    const customColumns =
      entityInitial?.entity.id === id && !serverSnapshotApplied
        ? entityInitial.customColumns
        : entityInitial === null && !requestHasAuthoritativeColumns
          ? undefined
          : store.customColumns;
    const personalization = config.personalization?.(customColumns, (resource) => root.userStore.canAccess(resource));
    const personalizationScope = root.userStore.user?.id ?? "anonymous";
    const emailsPanel = root.userStore.canAccess(Resource.inboxMessages) ? emailsPanelFor(entityType, id) : undefined;
    const fileResource = FILE_RESOURCE[entityType];
    const canOpenFiles = fileResource !== undefined && root.userStore.canAccess(fileResource);
    const canEditFiles = fileResource !== undefined && root.userStore.can(fileResource, Action.update);
    const invoicesPanel = root.userStore.canAccess(Resource.invoices)
      ? invoicesPanelFor(
          entityType,
          id,
          root.userStore.can(Resource.invoices, Action.create),
          root.userStore.can(Resource.organizations, Action.update),
        )
      : undefined;
    const panels = [
      ...(emailsPanel ? [{ id: "emails", label: t("Mailbox.title"), content: emailsPanel }] : []),
      ...(canOpenFiles
        ? [
            {
              id: "files",
              label: t("RecordFiles.title"),
              content: (
                <EntityFilesPanel
                  canEdit={canEditFiles}
                  entityType={entityType as RecordFileEntityType}
                  recordId={id}
                />
              ),
            },
            {
              id: "documents",
              label: t("RecordDocuments.title"),
              content: (
                <EntityDocumentsPanel
                  canEdit={canEditFiles}
                  entityType={entityType as RecordFileEntityType}
                  recordId={id}
                />
              ),
            },
          ]
        : []),
      ...(invoicesPanel ? [{ id: "invoices", label: t("Invoices.title"), content: invoicesPanel }] : []),
    ];
    const extraPanels = panels.length > 0 ? panels : undefined;

    return (
      <EntityDetailPersonalizationProvider
        key={`${personalizationScope}:${personalization?.p13nId ?? "disabled"}:${id}`}
        config={personalization}
        customColumnIds={customColumns?.map((column) => column.id)}
        initial={personalizationInitial}
        persistenceScope={personalizationScope}
      >
        <EntityDetailLayout
          canDelete={config.canDelete?.(store)}
          entityId={id}
          entityType={entityType}
          extraPanels={extraPanels}
          fallbackTitle={singular(entityType)}
          historyPanel={<EntityTimelinePanel entityId={id} entityType={entityType} initial={timelineInitial} />}
          identity={config.identity(store.fetchedEntity ?? {}, t, singular(entityType))}
          masterData={<Master layout="page" />}
          serverSnapshotApplied={serverSnapshotApplied}
          showNotesPanel={config.showNotesPanel}
          store={store}
          summary={Summary ? <Summary /> : undefined}
        />
      </EntityDetailPersonalizationProvider>
    );
  },
);
