"use client";

import type { AutomationDto } from "@/features/automation/automation.schema";

import { useTranslations } from "next-intl";
import { History, Pencil, Trash2 } from "lucide-react";

import { AutomationTriggerKind } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { deleteAutomationAction, upsertAutomationAction } from "../actions";

type Props = {
  automation: AutomationDto;
  onChanged: () => void;
  onEdit: () => void;
  onShowRuns: () => void;
};

export function AutomationRow({ automation, onChanged, onEdit, onShowRuns }: Props) {
  const t = useTranslations();
  const { singular } = useEntityTerminology();

  const triggerLabel =
    automation.triggerKind === AutomationTriggerKind.schedule
      ? t("Automations.triggers.schedule")
      : t(`Automations.triggers.${automation.triggerKind}`, {
          entity: automation.entityType ? singular(automation.entityType) : "",
        });

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{automation.name}</span>

        <span className="truncate text-xs text-muted-foreground">
          {t("Automations.rowSummary", {
            trigger: triggerLabel,
            steps: t("Automations.stepCount", { count: automation.steps.length }),
          })}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <AppChip size="sm" variant={automation.enabled ? "success" : "secondary"}>
          {automation.enabled ? t("Automations.enabled") : t("Automations.disabled")}
        </AppChip>

        <Switch
          aria-label={t("Automations.toggleLabel", { name: automation.name })}
          checked={automation.enabled}
          onCheckedChange={(next) =>
            runUserAction(async () => {
              await upsertAutomationAction({ id: automation.id, enabled: next });
              onChanged();
            })
          }
        />

        <Button
          aria-label={t("Automations.runsLabel", { name: automation.name })}
          size="icon-sm"
          variant="ghost"
          onClick={onShowRuns}
        >
          <History className="size-4" />
        </Button>

        <Button
          aria-label={t("Automations.editLabel", { name: automation.name })}
          size="icon-sm"
          variant="ghost"
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </Button>

        <Button
          aria-label={t("Automations.deleteLabel", { name: automation.name })}
          size="icon-sm"
          variant="ghost"
          onClick={() =>
            runUserAction(async () => {
              await deleteAutomationAction({ id: automation.id });
              onChanged();
            })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}
