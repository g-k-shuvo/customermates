"use client";

import type { AutomationDto } from "@/features/automation/automation.schema";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus, Workflow } from "lucide-react";

import { AutomationRow } from "./automation-row";
import { AutomationModal } from "./automation-modal";
import { AutomationsPageSkeleton } from "./automations-page-skeleton";

import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state/page-state";
import { runUserAction } from "@/core/errors/report-application-error";
import { getAutomationsAction } from "../actions";

type Props = {
  initialAutomations: AutomationDto[];
};

export const AutomationsPageView = observer(function AutomationsPageView({ initialAutomations }: Props) {
  const t = useTranslations();
  const [automations, setAutomations] = useState(initialAutomations);
  const [editing, setEditing] = useState<AutomationDto | null>(null);
  const [isOpen, setIsOpen] = useState(false);

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

        <Button id="automations-add" size="sm" onClick={openNew}>
          <Plus className="size-4" />

          {t("Automations.create")}
        </Button>
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
              onChanged={refresh}
              onEdit={() => openExisting(automation)}
            />
          ))}
        </ul>
      )}

      <AutomationModal
        automation={editing}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSaved={() => {
          setIsOpen(false);
          refresh();
        }}
      />
    </div>
  );
});
