"use client";

import type { AutomationDto, AutomationRunDto } from "@/features/automation/automation.schema";
import type { EntityType } from "@/generated/prisma";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AutomationRunStatus, AutomationTriggerKind } from "@/generated/prisma";
import { isAutomationStepError } from "@/features/automation/automation-step-errors";
import { automationTriggerForEvent } from "@/features/automation/automation-trigger-map";

import { AppChip } from "@/components/chip/app-chip";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { getAutomationRunsAction } from "../actions";

type Props = {
  automation: AutomationDto | null;
  isOpen: boolean;
  onClose: () => void;
};

const STATUS_COLOR = {
  [AutomationRunStatus.succeeded]: "success",
  [AutomationRunStatus.failed]: "destructive",
  [AutomationRunStatus.running]: "info",
  [AutomationRunStatus.queued]: "secondary",
  [AutomationRunStatus.skipped]: "secondary",
  [AutomationRunStatus.cancelled]: "warning",
} as const;

const SETTLED_WITHOUT_RUNNING = new Set<AutomationRunStatus>([
  AutomationRunStatus.skipped,
  AutomationRunStatus.cancelled,
]);

export function stepNeverRan(runStatus: AutomationRunStatus, stepStatus: AutomationRunStatus): boolean {
  return SETTLED_WITHOUT_RUNNING.has(runStatus) && stepStatus === AutomationRunStatus.queued;
}

type Translate = (key: string, values?: Record<string, string>) => string;

export function runTriggerLabel(
  event: string | null,
  t: Translate,
  singular: (entityType: EntityType) => string,
): string {
  if (!event || event === AutomationTriggerKind.schedule) return t("Automations.triggerKinds.schedule");

  const trigger = automationTriggerForEvent(event);
  if (!trigger) return event;

  return t(`Automations.triggers.${trigger.triggerKind}`, { entity: singular(trigger.entityType) });
}

export function AutomationRunsModal({ automation, isOpen, onClose }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { singular } = useEntityTerminology();
  const [runs, setRuns] = useState<AutomationRunDto[]>([]);

  useEffect(() => {
    if (!isOpen || !automation) return;

    runUserAction(async () => {
      setRuns(await getAutomationRunsAction({ automationId: automation.id }));
    });
  }, [automation, isOpen]);

  return (
    <AppModal open={isOpen} size="xl" title={t("Automations.runsTitle")} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg">{t("Automations.runsTitle")}</h2>
        </AppCardHeader>

        <AppCardBody>
          {runs.length === 0 ? (
            <p className="text-x-sm text-muted-foreground">{t("Automations.runsEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-col gap-1 rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{runTriggerLabel(run.triggerEvent, t, singular)}</span>

                    <AppChip size="sm" variant={STATUS_COLOR[run.status]}>
                      {t(`Automations.runStatuses.${run.status}`)}
                    </AppChip>
                  </div>

                  <span className="text-xs text-muted-foreground">
                    {intlStore.formatNumericalShortDateTime(run.createdAt)}
                  </span>

                  {run.status === AutomationRunStatus.skipped ? (
                    <span className="text-xs text-muted-foreground" data-automation-run-skipped="">
                      {t("Automations.runSkippedReason")}
                    </span>
                  ) : null}

                  {run.steps.map((step) => (
                    <span key={step.id} className="text-xs text-muted-foreground">
                      {t("Automations.runStepSummary", {
                        position: step.position + 1,
                        action: step.kind ? t(`Automations.actions.${step.kind}`) : "",
                        status: stepNeverRan(run.status, step.status)
                          ? t("Automations.stepNotRun")
                          : t(`Automations.runStatuses.${step.status}`),
                      })}

                      {step.error
                        ? ` — ${isAutomationStepError(step.error) ? t(`Automations.stepErrors.${step.error}`) : step.error}`
                        : ""}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}
