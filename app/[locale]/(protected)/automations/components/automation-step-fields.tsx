"use client";

import type { AutomationStepData } from "@/features/automation/automation-action.schema";
import type { EntityType } from "@/generated/prisma";

import { useTranslations } from "next-intl";

import { AutomationActionKind } from "@/generated/prisma";
import { actionSupportsEntity } from "@/features/automation/automation-action-support";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  step: AutomationStepData;
  entityType: EntityType | null;
  onChange: (next: AutomationStepData) => void;
};

const DEFAULT_CONFIG: Record<AutomationActionKind, unknown> = {
  [AutomationActionKind.updateField]: { field: "", value: "" },
  [AutomationActionKind.assignOwner]: { userId: null },
  [AutomationActionKind.addLabel]: { labels: [] },
  [AutomationActionKind.createTask]: {
    name: "",
    activityKind: null,
    dueInDays: null,
    assigneeUserId: null,
    linkToTriggerRecord: true,
  },
  [AutomationActionKind.createNote]: { body: "" },
  [AutomationActionKind.createDeal]: { name: "", pipelineId: null, stageId: null, ownerUserId: null },
  [AutomationActionKind.createLead]: { title: "", ownerUserId: null, labels: [] },
  [AutomationActionKind.moveStage]: { stageId: "" },
  [AutomationActionKind.sendEmail]: { to: "", subject: "", body: "" },
  [AutomationActionKind.callWebhook]: { url: "", includeRecord: true },
  [AutomationActionKind.delay]: { seconds: 3600 },
};

const LIST_FIELDS: Partial<Record<AutomationActionKind, string>> = {
  [AutomationActionKind.addLabel]: "labels",
  [AutomationActionKind.createLead]: "labels",
};

function listFieldFor(kind: AutomationActionKind): string | undefined {
  return LIST_FIELDS[kind];
}

function textFieldsFor(kind: AutomationActionKind): string[] {
  switch (kind) {
    case AutomationActionKind.updateField:
      return ["field", "value"];
    case AutomationActionKind.createTask:
      return ["name"];
    case AutomationActionKind.createNote:
      return ["body"];
    case AutomationActionKind.createDeal:
      return ["name"];
    case AutomationActionKind.createLead:
      return ["title"];
    case AutomationActionKind.assignOwner:
      return ["userId"];
    case AutomationActionKind.moveStage:
      return ["stageId"];
    case AutomationActionKind.sendEmail:
      return ["to", "subject", "body"];
    case AutomationActionKind.callWebhook:
      return ["url"];
    case AutomationActionKind.delay:
      return ["seconds"];
    default:
      return [];
  }
}

export function AutomationStepFields({ step, entityType, onChange }: Props) {
  const t = useTranslations();
  const config = (step.config ?? {}) as Record<string, unknown>;

  const setKind = (kind: AutomationActionKind) =>
    onChange({ kind, config: DEFAULT_CONFIG[kind] } as AutomationStepData);

  const setList = (field: string, value: string) =>
    onChange({
      kind: step.kind,
      config: {
        ...config,
        [field]: value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      },
    } as AutomationStepData);

  const setField = (field: string, value: string) =>
    onChange({
      kind: step.kind,
      config: { ...config, [field]: field === "seconds" ? Number(value) : value },
    } as AutomationStepData);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label>{t("Automations.fields.action")}</Label>

        <Select value={step.kind} onValueChange={(next) => setKind(next as AutomationActionKind)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {Object.values(AutomationActionKind)
              .filter((kind) => actionSupportsEntity(kind, entityType))
              .map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`Automations.actions.${kind}`)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {listFieldFor(step.kind) ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="automation-step-labels">{t("Automations.actionFields.labels")}</Label>

          <Input
            id="automation-step-labels"
            placeholder={t("Automations.actionFields.labelsPlaceholder")}
            value={(Array.isArray(config[listFieldFor(step.kind) as string])
              ? (config[listFieldFor(step.kind) as string] as string[])
              : []
            ).join(", ")}
            onChange={(event) => setList(listFieldFor(step.kind) as string, event.target.value)}
          />
        </div>
      ) : null}

      {textFieldsFor(step.kind).map((field) => (
        <div key={field} className="flex flex-col gap-1.5">
          <Label htmlFor={`automation-step-${field}`}>{t(`Automations.actionFields.${field}`)}</Label>

          <Input
            id={`automation-step-${field}`}
            value={String(config[field] ?? "")}
            onChange={(event) => setField(field, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
