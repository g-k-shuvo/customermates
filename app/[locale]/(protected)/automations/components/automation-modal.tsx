"use client";

import type { AutomationDto } from "@/features/automation/automation.schema";
import type { AutomationStepData } from "@/features/automation/automation-action.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import { AutomationActionKind, AutomationTriggerKind, EntityType } from "@/generated/prisma";

import type { AutomationTriggerEntityType } from "@/features/automation/automation.schema";
import { AUTOMATION_TRIGGER_ENTITY_TYPES } from "@/features/automation/automation.schema";

import { AutomationStepFields } from "./automation-step-fields";

import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runUserAction } from "@/core/errors/report-application-error";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { upsertAutomationAction } from "../actions";

type Props = {
  automation: AutomationDto | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const DEFAULT_STEP: AutomationStepData = {
  kind: AutomationActionKind.createTask,
  config: { name: "", activityKind: null, dueInDays: null, assigneeUserId: null, linkToTriggerRecord: true },
};

export function AutomationModal({ automation, isOpen, onClose, onSaved }: Props) {
  const t = useTranslations();
  const { singular } = useEntityTerminology();

  const [name, setName] = useState("");
  const [triggerKind, setTriggerKind] = useState<AutomationTriggerKind>(AutomationTriggerKind.recordCreated);
  const [entityType, setEntityType] = useState<AutomationTriggerEntityType>(EntityType.deal);
  const [schedule, setSchedule] = useState("0 9 * * 1");
  const [steps, setSteps] = useState<AutomationStepData[]>([DEFAULT_STEP]);

  useEffect(() => {
    if (!isOpen) return;

    setName(automation?.name ?? "");
    setTriggerKind(automation?.triggerKind ?? AutomationTriggerKind.recordCreated);
    setEntityType((automation?.entityType as AutomationTriggerEntityType | null) ?? EntityType.deal);
    setSchedule(automation?.schedule ?? "0 9 * * 1");
    setSteps(
      automation && automation.steps.length > 0
        ? automation.steps.map((step) => ({ kind: step.kind, config: step.config }) as AutomationStepData)
        : [DEFAULT_STEP],
    );
  }, [automation, isOpen]);

  const isSchedule = triggerKind === AutomationTriggerKind.schedule;

  const save = () =>
    runUserAction(async () => {
      const result = await upsertAutomationAction({
        ...(automation ? { id: automation.id } : {}),
        name,
        triggerKind,
        ...(isSchedule ? { entityType: null } : { entityType }),
        schedule: isSchedule ? schedule : null,
        steps,
      });

      if (result?.ok) onSaved();
    });

  return (
    <AppModal
      open={isOpen}
      size="xl"
      title={automation ? t("Automations.editTitle") : t("Automations.createTitle")}
      onClose={onClose}
    >
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg">{automation ? t("Automations.editTitle") : t("Automations.createTitle")}</h2>
        </AppCardHeader>

        <AppCardBody>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="automation-name">{t("Automations.fields.name")}</Label>

            <Input id="automation-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="automation-trigger">{t("Automations.fields.trigger")}</Label>

              <Select value={triggerKind} onValueChange={(next) => setTriggerKind(next as AutomationTriggerKind)}>
                <SelectTrigger id="automation-trigger">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {Object.values(AutomationTriggerKind).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`Automations.triggerKinds.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSchedule ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="automation-schedule">{t("Automations.fields.schedule")}</Label>

                <Input
                  id="automation-schedule"
                  value={schedule}
                  onChange={(event) => setSchedule(event.target.value)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="automation-entity">{t("Automations.fields.entityType")}</Label>

                <Select value={entityType} onValueChange={(next) => setEntityType(next as AutomationTriggerEntityType)}>
                  <SelectTrigger id="automation-entity">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {AUTOMATION_TRIGGER_ENTITY_TYPES.map((candidate) => (
                      <SelectItem key={candidate} value={candidate}>
                        {singular(candidate)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{t("Automations.fields.steps")}</Label>

              <Button size="sm" variant="secondary" onClick={() => setSteps([...steps, DEFAULT_STEP])}>
                <Plus className="size-4" />

                {t("Automations.addStep")}
              </Button>
            </div>

            {steps.map((step, index) => (
              <div key={`${step.kind}-${index}`} className="flex items-start gap-2 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <AutomationStepFields
                    entityType={isSchedule ? null : entityType}
                    step={step}
                    onChange={(next) => setSteps(steps.map((current, at) => (at === index ? next : current)))}
                  />
                </div>

                <Button
                  aria-label={t("Automations.removeStep")}
                  disabled={steps.length === 1}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setSteps(steps.filter((_, at) => at !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </AppCardBody>

        <AppCardFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("Common.actions.cancel")}
          </Button>

          <Button disabled={name.trim().length === 0} id="automation-modal-save" onClick={save}>
            {t("Common.actions.save")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
}
