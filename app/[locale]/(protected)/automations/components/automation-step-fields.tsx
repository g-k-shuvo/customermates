"use client";

import type { AutomationStepData } from "@/features/automation/automation-action.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { WritableFields } from "@/features/automation/run/automation-field-writes";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { AutomationActionKind, CustomColumnType, EntityType, LeadStatus } from "@/generated/prisma";
import { actionSupportsEntity } from "@/features/automation/automation-action-support";
import { SEND_EMAIL_RECIPIENT_KINDS } from "@/features/automation/automation-action.schema";
import {
  CUSTOM_WRITABLE_TYPES,
  DEAL_WRITABLE_FIELDS,
  RECORD_WRITABLE_FIELDS,
} from "@/features/automation/run/automation-field-writes";
import { MERGE_FIELDS } from "@/features/messaging-send/render/merge-fields";

import { ACTIVITY_KIND_VALUES } from "@/components/activity/activity-kind.config";
import { useActivityKindLabel } from "@/components/activity/activity-kind-icon";
import { useChangeFieldLabel } from "@/components/entity-terminology/use-change-field-label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type AutomationAuthoringOptions = {
  users: { id: string; name: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  customColumns: CustomColumnDto[];
};

type Props = {
  step: AutomationStepData;
  entityType: EntityType | null;
  options: AutomationAuthoringOptions;
  onChange: (next: AutomationStepData) => void;
};

type Descriptor =
  | { type: "text" | "number" | "textarea" | "markdown" | "user" | "activityKind" | "checkbox"; field: string }
  | { type: "stage"; field: string; pipelineField: string | null }
  | { type: "duration" | "labels" | "recipient" | "fieldWrite" };

const DURATION_UNITS = [
  { unit: "days", seconds: 86_400 },
  { unit: "hours", seconds: 3_600 },
  { unit: "minutes", seconds: 60 },
] as const;

const NONE = "__none__";

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
  [AutomationActionKind.sendEmail]: { recipient: { kind: "recordContact" }, subject: "", body: "" },
  [AutomationActionKind.callWebhook]: { url: "", includeRecord: true },
  [AutomationActionKind.delay]: { seconds: 3600 },
};

const DESCRIPTORS: Record<AutomationActionKind, Descriptor[]> = {
  [AutomationActionKind.updateField]: [{ type: "fieldWrite" }],
  [AutomationActionKind.assignOwner]: [{ type: "user", field: "userId" }],
  [AutomationActionKind.addLabel]: [{ type: "labels" }],
  [AutomationActionKind.createTask]: [
    { type: "text", field: "name" },
    { type: "activityKind", field: "activityKind" },
    { type: "number", field: "dueInDays" },
    { type: "user", field: "assigneeUserId" },
    { type: "checkbox", field: "linkToTriggerRecord" },
  ],
  [AutomationActionKind.createNote]: [{ type: "textarea", field: "body" }],
  [AutomationActionKind.createDeal]: [
    { type: "text", field: "name" },
    { type: "stage", field: "stageId", pipelineField: "pipelineId" },
    { type: "user", field: "ownerUserId" },
  ],
  [AutomationActionKind.createLead]: [
    { type: "text", field: "title" },
    { type: "user", field: "ownerUserId" },
    { type: "labels" },
  ],
  [AutomationActionKind.moveStage]: [{ type: "stage", field: "stageId", pipelineField: null }],
  [AutomationActionKind.sendEmail]: [
    { type: "recipient" },
    { type: "text", field: "subject" },
    { type: "text", field: "bannerUrl" },
    { type: "markdown", field: "body" },
  ],
  [AutomationActionKind.callWebhook]: [
    { type: "text", field: "url" },
    { type: "checkbox", field: "includeRecord" },
  ],
  [AutomationActionKind.delay]: [{ type: "duration" }],
};

type WriteTarget = {
  key: string;
  kind: "text" | "number" | "date" | "leadStatus" | "select";
  column?: CustomColumnDto;
};

function builtInTargets(fields: WritableFields | undefined): WriteTarget[] {
  return Object.entries(fields ?? {}).map(([key, rule]) => ({ key, kind: rule.kind }));
}

function customTargets(columns: CustomColumnDto[], entityType: EntityType | null): WriteTarget[] {
  return columns
    .filter((column) => column.entityType === entityType && CUSTOM_WRITABLE_TYPES.has(column.type))
    .map((column) => ({
      key: column.id,
      column,
      kind:
        column.type === CustomColumnType.singleSelect
          ? "select"
          : column.type === CustomColumnType.currency
            ? "number"
            : column.type === CustomColumnType.date
              ? "date"
              : "text",
    }));
}

function writeTargets(entityType: EntityType | null, columns: CustomColumnDto[]): WriteTarget[] {
  const builtIn =
    entityType === EntityType.deal ? DEAL_WRITABLE_FIELDS : entityType && RECORD_WRITABLE_FIELDS[entityType];

  return [...builtInTargets(builtIn || undefined), ...customTargets(columns, entityType)];
}

function durationParts(seconds: number) {
  const match = DURATION_UNITS.find(({ seconds: size }) => seconds >= size && seconds % size === 0);
  const unit = match ?? DURATION_UNITS[DURATION_UNITS.length - 1];

  return { amount: Math.max(1, Math.round(seconds / unit.seconds)), unit: unit.unit, size: unit.seconds };
}

export function AutomationStepFields({ step, entityType, options, onChange }: Props) {
  const t = useTranslations();
  const activityKindLabel = useActivityKindLabel();
  const fieldLabel = useChangeFieldLabel();
  const config = (step.config ?? {}) as Record<string, unknown>;
  const storedLabels = Array.isArray(config.labels) ? (config.labels as string[]) : [];
  const [labelsDraft, setLabelsDraft] = useState(storedLabels.join(", "));
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [pickedPipelineId, setPickedPipelineId] = useState<string | null>(null);

  useEffect(() => {
    setLabelsDraft(storedLabels.join(", "));
  }, [step.kind]);

  const emit = (next: Record<string, unknown>) =>
    onChange({ kind: step.kind, config: { ...config, ...next } } as unknown as AutomationStepData);

  const setKind = (kind: AutomationActionKind) =>
    onChange({ kind, config: DEFAULT_CONFIG[kind] } as AutomationStepData);

  const idFor = (field: string) => `automation-step-${field}`;
  const labelFor = (field: string) => t(`Automations.actionFields.${field}`);

  const selectInput = (args: {
    field: string;
    value: string | null;
    items: { value: string; label: string }[];
    noneLabel?: string;
    onValue: (value: string | null) => void;
  }) => (
    <div key={args.field} className="flex flex-col gap-1.5">
      <Label htmlFor={idFor(args.field)}>{labelFor(args.field)}</Label>

      <Select
        value={args.value ?? (args.noneLabel ? NONE : "")}
        onValueChange={(next) => args.onValue(next === NONE ? null : next)}
      >
        <SelectTrigger id={idFor(args.field)}>
          <SelectValue placeholder={t("Automations.actionFields.choose")} />
        </SelectTrigger>

        <SelectContent>
          {args.noneLabel ? <SelectItem value={NONE}>{args.noneLabel}</SelectItem> : null}

          {args.items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const insertMergeField = (field: string) => {
    const body = String(config.body ?? "");
    const element = bodyRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? body.length;

    emit({ body: `${body.slice(0, start)}{{ ${field} }}${body.slice(end)}` });
  };

  const renderStage = (descriptor: { field: string; pipelineField: string | null }) => {
    const stageId = typeof config[descriptor.field] === "string" ? (config[descriptor.field] as string) : "";
    const owning = options.pipelines.find((pipeline) => pipeline.stages.some((stage) => stage.id === stageId));
    const chosenPipelineId =
      (descriptor.pipelineField ? (config[descriptor.pipelineField] as string | null) : null) ??
      owning?.id ??
      pickedPipelineId;
    const pipeline = options.pipelines.find((candidate) => candidate.id === chosenPipelineId);
    const optional = descriptor.pipelineField !== null;

    return (
      <div key={descriptor.field} className="grid gap-3 sm:grid-cols-2">
        {selectInput({
          field: "pipelineId",
          value: chosenPipelineId,
          items: options.pipelines.map((candidate) => ({ value: candidate.id, label: candidate.name })),
          noneLabel: optional ? t("Automations.actionFields.defaultPipeline") : undefined,
          onValue: (pipelineId) => {
            setPickedPipelineId(pipelineId);
            emit({
              ...(descriptor.pipelineField ? { [descriptor.pipelineField]: pipelineId } : {}),
              [descriptor.field]: optional ? null : "",
            });
          },
        })}

        {selectInput({
          field: descriptor.field,
          value: stageId || null,
          items: (pipeline?.stages ?? []).map((stage) => ({ value: stage.id, label: stage.name })),
          noneLabel: optional ? t("Automations.actionFields.firstStage") : undefined,
          onValue: (next) => emit({ [descriptor.field]: next }),
        })}
      </div>
    );
  };

  const renderFieldWrite = () => {
    const targets = writeTargets(entityType, options.customColumns);
    const target = targets.find((candidate) => candidate.key === config.field);
    const value = config.value === null || config.value === undefined ? "" : String(config.value);

    const valueInput = () => {
      if (!target) return null;

      if (target.kind === "leadStatus" || target.kind === "select") {
        return selectInput({
          field: "value",
          value: value || null,
          items:
            target.kind === "leadStatus"
              ? Object.values(LeadStatus).map((status) => ({
                  value: status,
                  label: t(`Common.leadStatuses.${status}`),
                }))
              : target.column?.type === CustomColumnType.singleSelect
                ? target.column.options.options.map((option) => ({ value: option.value, label: option.label }))
                : [],
          onValue: (next) => emit({ value: next }),
        });
      }

      return (
        <div key="value" className="flex flex-col gap-1.5">
          <Label htmlFor={idFor("value")}>{labelFor("value")}</Label>

          <Input
            id={idFor("value")}
            type={target.kind === "number" ? "number" : target.kind === "date" ? "date" : "text"}
            value={target.kind === "date" ? value.slice(0, 10) : value}
            onChange={(event) =>
              emit({
                value:
                  target.kind === "number" && event.target.value !== ""
                    ? Number(event.target.value)
                    : event.target.value,
              })
            }
          />
        </div>
      );
    };

    return (
      <div key="fieldWrite" className="grid gap-3 sm:grid-cols-2">
        {selectInput({
          field: "field",
          value: target ? target.key : null,
          items: targets.map((candidate) => ({
            value: candidate.key,
            label: fieldLabel(candidate.key, options.customColumns),
          })),
          onValue: (field) => emit({ field: field ?? "", value: "" }),
        })}

        {valueInput()}
      </div>
    );
  };

  const renderRecipient = () => {
    const recipient = (config.recipient ?? { kind: "address", address: config.to ?? "" }) as {
      kind: string;
      address?: string;
    };
    const setRecipient = (next: { kind: string; address?: string }) => emit({ to: undefined, recipient: next });

    return (
      <div key="recipient" className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idFor("recipient")}>{labelFor("recipient")}</Label>

          <Select
            value={recipient.kind}
            onValueChange={(kind) => setRecipient(kind === "address" ? { kind, address: "" } : { kind })}
          >
            <SelectTrigger id={idFor("recipient")}>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {SEND_EMAIL_RECIPIENT_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`Automations.recipientKinds.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recipient.kind === "address" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idFor("address")}>{labelFor("address")}</Label>

            <Input
              id={idFor("address")}
              type="email"
              value={recipient.address ?? ""}
              onChange={(event) => setRecipient({ kind: "address", address: event.target.value })}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const renderDuration = () => {
    const parts = durationParts(Number(config.seconds) || 3600);

    return (
      <div key="duration" className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idFor("duration")}>{labelFor("duration")}</Label>

          <Input
            id={idFor("duration")}
            min={1}
            type="number"
            value={parts.amount}
            onChange={(event) => emit({ seconds: Math.max(1, Number(event.target.value) || 1) * parts.size })}
          />
        </div>

        {selectInput({
          field: "durationUnit",
          value: parts.unit,
          items: DURATION_UNITS.map(({ unit }) => ({ value: unit, label: t(`Automations.durationUnits.${unit}`) })),
          onValue: (unit) =>
            emit({ seconds: parts.amount * (DURATION_UNITS.find((entry) => entry.unit === unit)?.seconds ?? 60) }),
        })}
      </div>
    );
  };

  const render = (descriptor: Descriptor) => {
    switch (descriptor.type) {
      case "fieldWrite":
        return renderFieldWrite();
      case "recipient":
        return renderRecipient();
      case "duration":
        return renderDuration();
      case "stage":
        return renderStage(descriptor);
      case "labels":
        return (
          <div key="labels" className="flex flex-col gap-1.5">
            <Label htmlFor={idFor("labels")}>{labelFor("labels")}</Label>

            <Input
              id={idFor("labels")}
              placeholder={t("Automations.actionFields.labelsPlaceholder")}
              value={labelsDraft}
              onChange={(event) => {
                setLabelsDraft(event.target.value);
                emit({
                  labels: event.target.value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                });
              }}
            />
          </div>
        );
      case "user":
        return selectInput({
          field: descriptor.field,
          value: (config[descriptor.field] as string | null) ?? null,
          items: options.users.map((user) => ({ value: user.id, label: user.name })),
          noneLabel: descriptor.field === "userId" ? undefined : t("Automations.actionFields.nobody"),
          onValue: (userId) => emit({ [descriptor.field]: userId }),
        });
      case "activityKind":
        return selectInput({
          field: descriptor.field,
          value: (config[descriptor.field] as string | null) ?? null,
          items: ACTIVITY_KIND_VALUES.map((kind) => ({ value: kind, label: activityKindLabel(kind) })),
          noneLabel: activityKindLabel(null),
          onValue: (kind) => emit({ [descriptor.field]: kind }),
        });
      case "checkbox":
        return (
          <div key={descriptor.field} className="flex items-center gap-2">
            <Checkbox
              checked={config[descriptor.field] !== false}
              id={idFor(descriptor.field)}
              onCheckedChange={(checked) => emit({ [descriptor.field]: checked === true })}
            />

            <Label htmlFor={idFor(descriptor.field)}>{labelFor(descriptor.field)}</Label>
          </div>
        );
      case "number":
        return (
          <div key={descriptor.field} className="flex flex-col gap-1.5">
            <Label htmlFor={idFor(descriptor.field)}>{labelFor(descriptor.field)}</Label>

            <Input
              id={idFor(descriptor.field)}
              min={0}
              type="number"
              value={
                config[descriptor.field] === null || config[descriptor.field] === undefined
                  ? ""
                  : String(config[descriptor.field])
              }
              onChange={(event) =>
                emit({ [descriptor.field]: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
          </div>
        );
      case "textarea":
      case "markdown":
        return (
          <div key={descriptor.field} className="flex flex-col gap-1.5">
            <Label htmlFor={idFor(descriptor.field)}>{labelFor(descriptor.field)}</Label>

            <Textarea
              ref={descriptor.type === "markdown" ? bodyRef : undefined}
              id={idFor(descriptor.field)}
              rows={descriptor.type === "markdown" ? 8 : 4}
              value={String(config[descriptor.field] ?? "")}
              onChange={(event) => emit({ [descriptor.field]: event.target.value })}
            />

            {descriptor.type === "markdown" ? (
              <div className="flex flex-wrap items-center gap-1" data-merge-fields="">
                <span className="text-xs text-muted-foreground">{t("MessageTemplates.insertField")}</span>

                {MERGE_FIELDS.map((field) => (
                  <Button
                    key={field}
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => insertMergeField(field)}
                  >
                    {field}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        );
      case "text":
        return (
          <div key={descriptor.field} className="flex flex-col gap-1.5">
            <Label htmlFor={idFor(descriptor.field)}>{labelFor(descriptor.field)}</Label>

            <Input
              id={idFor(descriptor.field)}
              value={String(config[descriptor.field] ?? "")}
              onChange={(event) => emit({ [descriptor.field]: event.target.value })}
            />
          </div>
        );
    }
  };

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

      {DESCRIPTORS[step.kind].map(render)}
    </div>
  );
}
