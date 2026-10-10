"use client";

import type { AppModalActionProps, AppModalActions } from "@/components/modal";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowUpRight, RefreshCw } from "lucide-react";

import { WEB_FORM_SUBMISSION_STATUS_CHIP_COLOR } from "@/features/webform/submissions/web-form-submission-status-colors";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { InfoRow } from "@/components/shared/info-row";
import { AppLink } from "@/components/shared/app-link";
import { AppChip } from "@/components/chip/app-chip";
import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { CodeBlockAccordion } from "@/components/shared/code-block-accordion";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";

export const WebFormSubmissionModal = observer(function WebFormSubmissionModal() {
  const t = useTranslations();
  const { webFormSubmissionModalStore: store } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const columnLabel = useColumnLabel();
  const submission = store.form;

  const openLead: AppModalActionProps | null = submission.leadId
    ? {
        id: "open-web-form-submission-lead",
        label: t("WebFormSubmissions.openLead"),
        icon: ArrowUpRight,
        href: `/leads/${submission.leadId}`,
      }
    : null;
  const retry: AppModalActionProps | null = store.canRetry
    ? {
        id: "retry-web-form-submission",
        label: t("WebFormSubmissions.retry"),
        icon: RefreshCw,
        busy: store.isRetrying,
        onClick: () => runUserAction(() => store.retry()),
      }
    : null;
  const actions: AppModalActions = openLead ? [openLead] : retry ? [retry] : [];

  return (
    <AppModal actions={actions} size="xl" store={store} title={t("WebFormSubmissions.detailTitle")}>
      <AppCard>
        <AppCardHeader>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="grow truncate text-x-lg">{submission.sourceName}</h2>

            <AppChip size="sm" variant={WEB_FORM_SUBMISSION_STATUS_CHIP_COLOR[submission.status]}>
              {t(`WebFormSubmissions.statuses.${submission.status}`)}
            </AppChip>
          </div>
        </AppCardHeader>

        <AppCardBody>
          {submission.status === "failed" && submission.error && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {submission.error}
            </p>
          )}

          <InfoRow label={columnLabel("receivedAt")}>
            {intlStore.formatNumericalShortDateTime(submission.receivedAt)}
          </InfoRow>

          <InfoRow label={t("WebFormSubmissions.processedAt")}>
            {submission.processedAt ? intlStore.formatNumericalShortDateTime(submission.processedAt) : "-"}
          </InfoRow>

          <InfoRow label={columnLabel("submitter")}>
            {[submission.name, submission.email].filter(Boolean).join(" · ") || "-"}
          </InfoRow>

          <InfoRow label={columnLabel("lead")}>
            {submission.leadId ? (
              <AppLink href={`/leads/${submission.leadId}`}>{submission.leadTitle ?? submission.leadId}</AppLink>
            ) : (
              (submission.leadTitle ?? "-")
            )}
          </InfoRow>

          <InfoRow label={t("WebFormSubmissions.externalId")}>{submission.externalId ?? "-"}</InfoRow>

          <CodeBlockAccordion
            code={JSON.stringify(submission.rawPayload, null, 2)}
            title={t("WebFormSubmissions.payload")}
          />
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
