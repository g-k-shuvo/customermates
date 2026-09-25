"use client";

import type { AutomationDto, AutomationRunDto } from "@/features/automation/automation.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AutomationRunStatus } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
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

export function AutomationRunsModal({ automation, isOpen, onClose }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
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
                    <span className="text-sm">{run.triggerEvent ?? t("Automations.triggerKinds.schedule")}</span>

                    <AppChip size="sm" variant={STATUS_COLOR[run.status]}>
                      {t(`Automations.runStatuses.${run.status}`)}
                    </AppChip>
                  </div>

                  <span className="text-xs text-muted-foreground">
                    {intlStore.formatNumericalShortDateTime(run.createdAt)}
                  </span>

                  {run.steps.map((step) => (
                    <span key={step.id} className="text-xs text-muted-foreground">
                      {t("Automations.runStepSummary", {
                        position: step.position + 1,
                        action: step.kind ? t(`Automations.actions.${step.kind}`) : "",
                        status: t(`Automations.runStatuses.${step.status}`),
                      })}

                      {step.error ? ` — ${step.error}` : ""}
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
