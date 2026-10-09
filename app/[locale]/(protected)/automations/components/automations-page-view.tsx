"use client";

import type { AutomationDto } from "@/features/automation/automation.schema";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { FileText, Plus, Workflow } from "lucide-react";

import { AutomationRow } from "./automation-row";
import { AutomationModal } from "./automation-modal";
import { AutomationRunsModal } from "./automation-runs-modal";
import { AutomationsPageSkeleton } from "./automations-page-skeleton";

import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state/page-state";
import { runUserAction } from "@/core/errors/report-application-error";
import { getAutomationsAction } from "../actions";

type Props = {
  initialAutomations: AutomationDto[];
  schedulesEnabled: boolean;
};

export const AutomationsPageView = observer(function AutomationsPageView({
  initialAutomations,
  schedulesEnabled,
}: Props) {
  const t = useTranslations();
  const [automations, setAutomations] = useState(initialAutomations);
  const [editing, setEditing] = useState<AutomationDto | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [runsFor, setRunsFor] = useState<AutomationDto | null>(null);

  const refresh = () =>
    runUserAction(async () => {
      setAutomations(await getAutomationsAction());
    });

  const openNew = () => {
    setEditing(null);
    setIsOpen(true);
  };

  const openExisting = (automation: AutomationDto) => {
    setEditing(automation);
    setIsOpen(true);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("Automations.title")}</h1>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <AppLink appearance="unstyled" href="/automations/templates" id="automations-templates">
              <FileText aria-hidden className="size-4" />

              {t("MessageTemplates.title")}
            </AppLink>
          </Button>

          <Button id="automations-add" size="sm" onClick={openNew}>
            <Plus className="size-4" />

            {t("Automations.create")}
          </Button>
        </div>
      </div>

      {automations.length === 0 ? (
        <PageState
          action={
            <Button size="sm" onClick={openNew}>
              {t("Automations.create")}
            </Button>
          }
          background={<AutomationsPageSkeleton animated={false} />}
          description={t("Automations.emptyBody")}
          icon={Workflow}
          state="empty"
          title={t("Automations.emptyTitle")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {automations.map((automation) => (
            <AutomationRow
              key={automation.id}
              automation={automation}
              schedulesEnabled={schedulesEnabled}
              onChanged={refresh}
              onEdit={() => openExisting(automation)}
              onShowRuns={() => setRunsFor(automation)}
            />
          ))}
        </ul>
      )}

      <AutomationRunsModal automation={runsFor} isOpen={runsFor !== null} onClose={() => setRunsFor(null)} />

      <AutomationModal
        automation={editing}
        isOpen={isOpen}
        schedulesEnabled={schedulesEnabled}
        onClose={() => setIsOpen(false)}
        onSaved={() => {
          setIsOpen(false);
          refresh();
        }}
      />
    </div>
  );
});
