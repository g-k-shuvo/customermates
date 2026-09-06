/**
 * Pure Pipedrive -> Customermates mapping.
 *
 * Nothing in this file performs IO. Every function takes the source record plus
 * the already-resolved lookup tables and returns the payload the REST API expects,
 * so the whole mapping layer is unit testable without a server or a Pipedrive
 * account (see `__tests__/mapping.test.ts`).
 */

import type {
  PipedriveActivity,
  PipedriveDeal,
  PipedriveDealField,
  PipedriveDealStatus,
  PipedriveFlowEntry,
  PipedriveNote,
  PipedriveOrganization,
  PipedrivePerson,
  PipedrivePipeline,
  PipedriveReference,
  PipedriveStage,
} from "./pipedrive.types";

import { ActivityKind } from "@/generated/prisma";

import { convert as htmlToText } from "html-to-text";

import {
  contactPointValues,
  parseDealStatus,
  parsePipedriveDate,
  parsePipedriveNumber,
  referenceEmail,
  referenceId,
  referenceName,
} from "./pipedrive.types";

/** Labels of the bookkeeping columns the migration provisions on the target. */
export const PIPEDRIVE_ID_COLUMN = "pipedrive_id";
export const PIPEDRIVE_NOTE_IDS_COLUMN = "pipedrive_note_ids";
export const PIPEDRIVE_VALUE_COLUMN = "pipedrive_value";
export const PIPEDRIVE_CURRENCY_COLUMN = "pipedrive_currency";
export const PIPEDRIVE_CLOSED_AT_COLUMN = "pipedrive_closed_at";
export const PIPEDRIVE_PHONE_COLUMN = "pipedrive_phone";
export const PIPEDRIVE_ADDRESS_COLUMN = "pipedrive_address";

/**
 * A single service carries every migrated deal's monetary value. `totalValue` is
 * derived from `sum(service.amount * quantity)`, so a unit-priced service with
 * `quantity = value` is the only way to land the Pipedrive amount through the
 * interactors. See the README for the consequence on `totalQuantity`.
 */
export const DEAL_VALUE_SERVICE_NAME = "Pipedrive deal value";
export const DEAL_VALUE_SERVICE_AMOUNT = 1;

export const MULTI_VALUE_SEPARATOR = ",";

export type CustomFieldValueInput = { columnId: string; value: string };

export type OwnerLookup = {
  userIdByPipedriveUserId: ReadonlyMap<number, string>;
  emailByPipedriveUserId: ReadonlyMap<number, string>;
  fallbackUserId: string | null;
};

export type OwnerResolution = {
  userIds: string[];
  usedFallback: boolean;
  unmatched: { pipedriveUserId: number; email: string | null } | null;
};

/**
 * Owner mapping: a Pipedrive user becomes the target `User` with the same email.
 * Anything that does not match falls back to the nominated user and is reported.
 */
export function resolveOwner(ownerReference: PipedriveReference, lookup: OwnerLookup): OwnerResolution {
  const pipedriveUserId = referenceId(ownerReference);

  if (pipedriveUserId === null) return { userIds: [], usedFallback: false, unmatched: null };

  const matched = lookup.userIdByPipedriveUserId.get(pipedriveUserId);
  if (matched) return { userIds: [matched], usedFallback: false, unmatched: null };

  const email = referenceEmail(ownerReference) ?? lookup.emailByPipedriveUserId.get(pipedriveUserId) ?? null;
  const unmatched = { pipedriveUserId, email };

  if (!lookup.fallbackUserId) return { userIds: [], usedFallback: false, unmatched };

  return { userIds: [lookup.fallbackUserId], usedFallback: true, unmatched };
}

/** Builds a target `User` index from the Pipedrive user list, matched on email. */
export function buildOwnerLookup(args: {
  pipedriveUsers: readonly { id: number; email?: string | null }[];
  targetUserIdByEmail: ReadonlyMap<string, string>;
  fallbackUserId: string | null;
}): OwnerLookup {
  const userIdByPipedriveUserId = new Map<number, string>();
  const emailByPipedriveUserId = new Map<number, string>();

  for (const user of args.pipedriveUsers) {
    const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
    if (email === "") continue;

    emailByPipedriveUserId.set(user.id, email);

    const targetUserId = args.targetUserIdByEmail.get(email);
    if (targetUserId) userIdByPipedriveUserId.set(user.id, targetUserId);
  }

  return { userIdByPipedriveUserId, emailByPipedriveUserId, fallbackUserId: args.fallbackUserId };
}

function nonBlank(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function htmlToMarkdown(html: unknown): string {
  const raw = nonBlank(html);
  if (!raw) return "";

  return htmlToText(raw, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: false, hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}

export type OrganizationCreatePayload = {
  name: string;
  userIds: string[];
  customFieldValues: CustomFieldValueInput[];
};

export type MappingSkip = { skipped: true; reason: string };
export type MappingResult<T> = ({ skipped: false } & T) | MappingSkip;

export type OrganizationColumns = { pipedriveIdColumnId: string; addressColumnId: string | null };

export function mapOrganization(
  organization: PipedriveOrganization,
  columns: OrganizationColumns,
  owners: OwnerLookup,
): MappingResult<{ payload: OrganizationCreatePayload; owner: OwnerResolution }> {
  const name = nonBlank(organization.name);
  if (!name) return { skipped: true, reason: "organization has no name" };

  const owner = resolveOwner(organization.owner_id, owners);
  const customFieldValues: CustomFieldValueInput[] = [
    { columnId: columns.pipedriveIdColumnId, value: String(organization.id) },
  ];

  const address = nonBlank(organization.address);
  if (address && columns.addressColumnId)
    customFieldValues.push({ columnId: columns.addressColumnId, value: clamp(address, 1000) });

  return {
    skipped: false,
    payload: { name: clamp(name, 255), userIds: owner.userIds, customFieldValues },
    owner,
  };
}

/**
 * Pipedrive stores one `name` plus optional `first_name`/`last_name`. The target
 * requires a non-blank first name, so fall back to splitting on the first space
 * and finally to the whole name.
 */
export function splitPersonName(person: PipedrivePerson): { firstName: string; lastName: string } {
  const first = nonBlank(person.first_name);
  const last = nonBlank(person.last_name);

  if (first) return { firstName: clamp(first, 255), lastName: clamp(last ?? "", 255) };

  const full = nonBlank(person.name);
  if (!full) return { firstName: "", lastName: clamp(last ?? "", 255) };

  const separator = full.indexOf(" ");
  if (separator < 0) return { firstName: clamp(full, 255), lastName: clamp(last ?? "", 255) };

  return {
    firstName: clamp(full.slice(0, separator), 255),
    lastName: clamp(last ?? full.slice(separator + 1).trim(), 255),
  };
}

export type ContactIdentifierInput = { provider: "mail"; value: string };

export function personEmailIdentifiers(person: PipedrivePerson): ContactIdentifierInput[] {
  return contactPointValues(person.email)
    .filter((value) => value.includes("@") && value.length <= 320)
    .map((value) => ({ provider: "mail" as const, value }));
}

export type ContactCreatePayload = {
  firstName: string;
  lastName: string;
  organizationIds: string[];
  userIds: string[];
  identifiers: ContactIdentifierInput[];
  customFieldValues: CustomFieldValueInput[];
};

export type ContactColumns = { pipedriveIdColumnId: string; phoneColumnId: string | null };

export function mapPerson(
  person: PipedrivePerson,
  columns: ContactColumns,
  owners: OwnerLookup,
  organizationIdByPipedriveId: ReadonlyMap<number, string>,
): MappingResult<{ payload: ContactCreatePayload; owner: OwnerResolution; missingOrganizationId: number | null }> {
  const { firstName, lastName } = splitPersonName(person);
  if (firstName === "") return { skipped: true, reason: "person has no name" };

  const owner = resolveOwner(person.owner_id, owners);
  const sourceOrganizationId = referenceId(person.org_id);
  const organizationId = sourceOrganizationId === null ? null : organizationIdByPipedriveId.get(sourceOrganizationId);

  const customFieldValues: CustomFieldValueInput[] = [
    { columnId: columns.pipedriveIdColumnId, value: String(person.id) },
  ];

  const phones = contactPointValues(person.phone);
  if (phones.length > 0 && columns.phoneColumnId)
    customFieldValues.push({ columnId: columns.phoneColumnId, value: phones.join(MULTI_VALUE_SEPARATOR) });

  return {
    skipped: false,
    payload: {
      firstName,
      lastName,
      organizationIds: organizationId ? [organizationId] : [],
      userIds: owner.userIds,
      identifiers: personEmailIdentifiers(person),
      customFieldValues,
    },
    owner,
    missingOrganizationId: sourceOrganizationId !== null && !organizationId ? sourceOrganizationId : null,
  };
}

export type StageCreateInput = {
  name: string;
  probability: number;
  rottingDays: number | null;
  kind: "open" | "won" | "lost";
};

export type PipelineCreatePayload = {
  name: string;
  position: number;
  isDefault: boolean;
  stages: StageCreateInput[];
};

export type TerminalStageNames = { won: string; lost: string };

function clampProbability(value: unknown): number {
  const parsed = parsePipedriveNumber(value);
  if (parsed === null) return 0;

  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/**
 * The one `order_nr` ordering of Pipedrive stages. Both the pipeline payload and
 * the append path in `run-migration` sort through this, so a pipeline created in
 * one run and extended in the next ends up in the same order either way.
 */
export function sortStagesByOrderNumber(stages: readonly PipedriveStage[]): PipedriveStage[] {
  return [...stages].sort((a, b) => (a.order_nr ?? 0) - (b.order_nr ?? 0) || a.id - b.id);
}

/** The Won/Lost pair every imported pipeline needs for the closing transitions to land. */
export function terminalStages(terminalNames: TerminalStageNames): StageCreateInput[] {
  return [
    { name: terminalNames.won, probability: 100, rottingDays: null, kind: "won" },
    { name: terminalNames.lost, probability: 0, rottingDays: null, kind: "lost" },
  ];
}

export function mapStage(stage: PipedriveStage): StageCreateInput | null {
  const name = nonBlank(stage.name);
  if (!name) return null;

  const rottenDays = parsePipedriveNumber(stage.rotten_days);
  const rotting = stage.rotten_flag === true && rottenDays !== null && rottenDays >= 1;

  return {
    name: clamp(name, 255),
    probability: clampProbability(stage.deal_probability),
    rottingDays: rotting ? Math.round(rottenDays) : null,
    kind: "open",
  };
}

/** Pipedrive stages, in `order_nr` order, followed by the terminal Won/Lost pair. */
export function mapPipelineStages(
  stages: readonly PipedriveStage[],
  terminalNames: TerminalStageNames,
): StageCreateInput[] {
  const open = sortStagesByOrderNumber(stages).flatMap((stage): StageCreateInput[] => {
    const mapped = mapStage(stage);

    return mapped ? [mapped] : [];
  });

  return [...open, ...terminalStages(terminalNames)];
}

export function mapPipeline(
  pipeline: PipedrivePipeline,
  stages: readonly PipedriveStage[],
  options: { isDefault: boolean; terminalNames: TerminalStageNames },
): MappingResult<{ payload: PipelineCreatePayload }> {
  const name = nonBlank(pipeline.name);
  if (!name) return { skipped: true, reason: "pipeline has no name" };

  const mappedStages = mapPipelineStages(stages, options.terminalNames);
  if (mappedStages.length === 0) return { skipped: true, reason: "pipeline has no stages" };

  return {
    skipped: false,
    payload: {
      name: clamp(name, 255),
      position: Math.max(0, Math.round(parsePipedriveNumber(pipeline.order_nr) ?? 0)),
      isDefault: options.isDefault,
      stages: mappedStages,
    },
  };
}

export type CustomColumnSpec =
  | { supported: true; label: string; type: "plain" | "date" | "currency" | "singleSelect"; optionLabels: string[] }
  | { supported: false; label: string; fieldType: string };

const STANDARD_DEAL_FIELD_KEYS = new Set([
  "id",
  "title",
  "value",
  "currency",
  "status",
  "probability",
  "expected_close_date",
  "close_time",
  "won_time",
  "lost_time",
  "lost_reason",
  "add_time",
  "update_time",
  "stage_id",
  "pipeline_id",
  "person_id",
  "org_id",
  "user_id",
  "creator_user_id",
  "stage_change_time",
  "active",
  "deleted",
  "visible_to",
  "cc_email",
  "weighted_value",
  "formatted_value",
  "formatted_weighted_value",
  "rotten_time",
  "next_activity_id",
  "last_activity_id",
]);

/** A Pipedrive custom deal field is any field whose key is a 40-char hash. */
export function isCustomDealField(field: PipedriveDealField): boolean {
  const key = nonBlank(field.key);
  if (!key) return false;

  return !STANDARD_DEAL_FIELD_KEYS.has(key) && /^[0-9a-f]{40}$/u.test(key);
}

/**
 * Deal field -> custom column. Types with no faithful home (`set`, `address`,
 * `user`, ranges) degrade to `plain` text; genuinely unmappable types are
 * reported instead of guessed at.
 */
export function mapDealFieldToCustomColumn(field: PipedriveDealField): CustomColumnSpec {
  const label = nonBlank(field.name) ?? nonBlank(field.key) ?? `pipedrive_field_${field.id}`;
  const fieldType = nonBlank(field.field_type) ?? "unknown";
  const optionLabels = (field.options ?? []).flatMap((option) => {
    const optionLabel = nonBlank(option.label);
    return optionLabel ? [clamp(optionLabel, 255)] : [];
  });

  if (fieldType === "enum") {
    if (optionLabels.length === 0) return { supported: false, label, fieldType };
    return { supported: true, label: clamp(label, 255), type: "singleSelect", optionLabels };
  }

  if (fieldType === "date") return { supported: true, label: clamp(label, 255), type: "date", optionLabels: [] };
  if (fieldType === "monetary")
    return { supported: true, label: clamp(label, 255), type: "currency", optionLabels: [] };

  const plainTypes = new Set([
    "varchar",
    "varchar_auto",
    "text",
    "double",
    "phone",
    "set",
    "address",
    "user",
    "org",
    "people",
    "time",
    "timerange",
    "daterange",
  ]);

  if (plainTypes.has(fieldType)) return { supported: true, label: clamp(label, 255), type: "plain", optionLabels: [] };

  return { supported: false, label, fieldType };
}

export type DealFieldBinding = {
  key: string;
  columnId: string;
  fieldType: string;
  labelByOptionId: ReadonlyMap<string, string>;
};

/** Renders one Pipedrive deal custom-field value as the string the column stores. */
export function formatDealFieldValue(raw: unknown, binding: DealFieldBinding): string | null {
  if (raw === null || raw === undefined) return null;

  if (binding.fieldType === "date") return parsePipedriveDate(raw)?.toISOString() ?? null;

  if (binding.fieldType === "enum" || binding.fieldType === "set") {
    const ids = String(raw)
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    const labels = ids.flatMap((id) => {
      const label = binding.labelByOptionId.get(id);
      return label ? [label] : [];
    });

    return labels.length > 0 ? labels.join(MULTI_VALUE_SEPARATOR) : null;
  }

  if (typeof raw === "object") {
    const value = (raw as { value?: unknown }).value;
    return value === undefined || value === null ? null : nonBlank(String(value));
  }

  if (typeof raw === "boolean") return raw ? "true" : "false";

  return nonBlank(String(raw));
}

export function mapDealCustomFieldValues(
  deal: PipedriveDeal,
  bindings: readonly DealFieldBinding[],
): CustomFieldValueInput[] {
  return bindings.flatMap((binding) => {
    const value = formatDealFieldValue(deal[binding.key], binding);
    return value === null ? [] : [{ columnId: binding.columnId, value }];
  });
}

export type DealCreatePayload = {
  name: string;
  pipelineId?: string;
  stageId?: string;
  expectedCloseDate?: string;
  probability?: number;
  organizationIds: string[];
  contactIds: string[];
  userIds: string[];
  services: { serviceId: string; quantity: number }[];
  customFieldValues: CustomFieldValueInput[];
};

export type DealColumns = {
  pipedriveIdColumnId: string;
  valueColumnId: string | null;
  currencyColumnId: string | null;
  closedAtColumnId: string | null;
};

export type DealMappingContext = {
  columns: DealColumns;
  fieldBindings: readonly DealFieldBinding[];
  owners: OwnerLookup;
  organizationIdByPipedriveId: ReadonlyMap<number, string>;
  contactIdByPipedriveId: ReadonlyMap<number, string>;
  pipelineIdByPipedriveId: ReadonlyMap<number, string>;
  stageIdByPipedriveId: ReadonlyMap<number, string>;
  valueServiceId: string | null;
};

export type DealMapping = {
  payload: DealCreatePayload;
  owner: OwnerResolution;
  status: PipedriveDealStatus;
  lostReason: string | null;
  warnings: string[];
};

export function mapDeal(deal: PipedriveDeal, context: DealMappingContext): MappingResult<DealMapping> {
  const status = parseDealStatus(deal.status);
  if (status === "deleted") return { skipped: true, reason: "deal is deleted in Pipedrive" };

  const name = nonBlank(deal.title);
  if (!name) return { skipped: true, reason: "deal has no title" };

  const warnings: string[] = [];
  const owner = resolveOwner(deal.user_id, context.owners);

  const sourcePipelineId = referenceId(deal.pipeline_id);
  const pipelineId = sourcePipelineId === null ? undefined : context.pipelineIdByPipedriveId.get(sourcePipelineId);
  if (sourcePipelineId !== null && !pipelineId) warnings.push(`unknown pipeline ${sourcePipelineId}`);

  const sourceStageId = referenceId(deal.stage_id);
  const stageId = sourceStageId === null ? undefined : context.stageIdByPipedriveId.get(sourceStageId);
  if (sourceStageId !== null && !stageId) warnings.push(`unknown stage ${sourceStageId}`);

  const sourceOrganizationId = referenceId(deal.org_id);
  const organizationId =
    sourceOrganizationId === null ? undefined : context.organizationIdByPipedriveId.get(sourceOrganizationId);
  if (sourceOrganizationId !== null && !organizationId) warnings.push(`unknown organization ${sourceOrganizationId}`);

  const sourceContactId = referenceId(deal.person_id);
  const contactId = sourceContactId === null ? undefined : context.contactIdByPipedriveId.get(sourceContactId);
  if (sourceContactId !== null && !contactId) warnings.push(`unknown person ${sourceContactId}`);

  const customFieldValues: CustomFieldValueInput[] = [
    { columnId: context.columns.pipedriveIdColumnId, value: String(deal.id) },
    ...mapDealCustomFieldValues(deal, context.fieldBindings),
  ];

  const value = parsePipedriveNumber(deal.value);
  if (value !== null && context.columns.valueColumnId)
    customFieldValues.push({ columnId: context.columns.valueColumnId, value: String(value) });

  const currency = nonBlank(deal.currency);
  if (currency && context.columns.currencyColumnId)
    customFieldValues.push({ columnId: context.columns.currencyColumnId, value: currency });

  const closedAt = parsePipedriveDate(deal.close_time ?? deal.won_time ?? deal.lost_time);
  if (closedAt && context.columns.closedAtColumnId)
    customFieldValues.push({ columnId: context.columns.closedAtColumnId, value: closedAt.toISOString() });

  const services: { serviceId: string; quantity: number }[] = [];
  if (value !== null && context.valueServiceId) {
    if (value < 0) warnings.push("negative deal value is not representable; value left at 0");
    else services.push({ serviceId: context.valueServiceId, quantity: value / DEAL_VALUE_SERVICE_AMOUNT });
  }

  const expectedCloseDate = parsePipedriveDate(deal.expected_close_date);
  const probability = parsePipedriveNumber(deal.probability);

  return {
    skipped: false,
    payload: {
      name: clamp(name, 255),
      ...(pipelineId ? { pipelineId } : {}),
      ...(stageId ? { stageId } : {}),
      ...(expectedCloseDate ? { expectedCloseDate: expectedCloseDate.toISOString() } : {}),
      ...(probability === null ? {} : { probability: Math.min(100, Math.max(0, probability)) }),
      organizationIds: organizationId ? [organizationId] : [],
      contactIds: contactId ? [contactId] : [],
      userIds: owner.userIds,
      services,
      customFieldValues,
    },
    owner,
    status,
    lostReason: nonBlank(deal.lost_reason),
    warnings,
  };
}

export type TargetDealStatus = "open" | "won" | "lost";

export type ClosingDecision =
  | { action: "none" }
  | { action: "won" }
  | { action: "lost" }
  | { action: "reopen" }
  | { action: "reopenThenWin" }
  | { action: "reopenThenLose" }
  | { action: "skip"; reason: string };

/**
 * Deal status -> closing transition. A deal is always created open, so reaching a
 * closed source status means calling `won`/`lost`; a target that is already closed
 * in the wrong state has to be reopened first. Re-running yields `none`.
 */
export function decideClosingTransition(args: {
  sourceStatus: PipedriveDealStatus;
  currentStatus: TargetDealStatus;
  hasLostReason: boolean;
}): ClosingDecision {
  const { sourceStatus, currentStatus, hasLostReason } = args;

  if (sourceStatus === "deleted") return { action: "skip", reason: "deal is deleted in Pipedrive" };

  if (sourceStatus === "open") return currentStatus === "open" ? { action: "none" } : { action: "reopen" };

  if (sourceStatus === "won") {
    if (currentStatus === "won") return { action: "none" };
    if (currentStatus === "lost") return { action: "reopenThenWin" };
    return { action: "won" };
  }

  if (!hasLostReason) return { action: "skip", reason: "lost deal has no lost reason to map" };
  if (currentStatus === "lost") return { action: "none" };
  if (currentStatus === "won") return { action: "reopenThenLose" };

  return { action: "lost" };
}

export type StageChange = { stageId: number; changedAt: Date };

/**
 * Deal flow -> stage history. Only `stage_id` changes matter, and they are replayed
 * oldest first so the funnel reads in the order it actually happened.
 */
export function orderStageChanges(flow: readonly PipedriveFlowEntry[]): StageChange[] {
  const changes = flow.flatMap((entry): StageChange[] => {
    const data = entry.data;
    if (!data) return [];
    if (data.field_key !== "stage_id") return [];

    const stageId = parsePipedriveNumber(data.new_value);
    if (stageId === null) return [];

    const changedAt = parsePipedriveDate(data.log_time ?? entry.timestamp);
    if (!changedAt) return [];

    return [{ stageId, changedAt }];
  });

  return changes.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
}

/** Collapses consecutive repeats so a replay never writes the same stage twice. */
export function stageReplayPlan(
  changes: readonly StageChange[],
  stageIdByPipedriveId: ReadonlyMap<number, string>,
  finalStageId: string | undefined,
): string[] {
  const targets = changes.flatMap((change) => {
    const stageId = stageIdByPipedriveId.get(change.stageId);
    return stageId ? [stageId] : [];
  });

  if (finalStageId) targets.push(finalStageId);

  return targets.filter((stageId, index) => index === 0 || targets[index - 1] !== stageId);
}

export type TaskCreatePayload = {
  name: string;
  notes?: string;
  activityKind?: ActivityKind;
  dueAt?: string;
  durationMinutes?: number;
  userIds: string[];
  contactIds: string[];
  organizationIds: string[];
  dealIds: string[];
  customFieldValues: CustomFieldValueInput[];
};

export type ActivityMappingContext = {
  pipedriveIdColumnId: string;
  owners: OwnerLookup;
  dealIdByPipedriveId: ReadonlyMap<number, string>;
  contactIdByPipedriveId: ReadonlyMap<number, string>;
  organizationIdByPipedriveId: ReadonlyMap<number, string>;
};

/**
 * Pipedrive's six default activity types are exactly the `ActivityKind` values, so
 * a default type maps straight across and only a customised type is reported.
 */
export const ACTIVITY_KIND_BY_PIPEDRIVE_TYPE: ReadonlyMap<string, ActivityKind> = new Map([
  ["call", ActivityKind.call],
  ["meeting", ActivityKind.meeting],
  ["email", ActivityKind.email],
  ["task", ActivityKind.task],
  ["deadline", ActivityKind.deadline],
  ["lunch", ActivityKind.lunch],
]);

export function mapActivityKind(type: unknown): ActivityKind | null {
  const key = nonBlank(type)?.toLowerCase();

  return key === undefined ? null : (ACTIVITY_KIND_BY_PIPEDRIVE_TYPE.get(key) ?? null);
}

/** `due_date` plus the optional `due_time`, read as UTC like every other Pipedrive stamp. */
export function parseActivityDueAt(activity: PipedriveActivity): Date | null {
  const dueDate = nonBlank(activity.due_date);
  if (!dueDate) return null;

  const dueTime = nonBlank(activity.due_time);

  return parsePipedriveDate(dueTime ? `${dueDate} ${dueTime}` : dueDate);
}

const ACTIVITY_DURATION = /^(\d{1,3}):([0-5]\d)(?::[0-5]\d)?$/u;

/** Pipedrive durations are `HH:MM`; `durationMinutes` is a positive whole number of minutes. */
export function parseActivityDurationMinutes(duration: unknown): number | null {
  const raw = nonBlank(duration);
  if (!raw) return null;

  const parts = ACTIVITY_DURATION.exec(raw);
  const minutes = parts ? Number(parts[1]) * 60 + Number(parts[2]) : parsePipedriveNumber(raw);
  if (minutes === null) return null;

  const rounded = Math.round(minutes);

  return rounded >= 1 ? rounded : null;
}

/**
 * Activity -> Task. The type, due date and duration land on `activityKind`,
 * `dueAt` and `durationMinutes`. Completion has no write path through the public
 * API, so a done activity keeps that fact in its notes and is reported.
 */
export function mapActivity(
  activity: PipedriveActivity,
  context: ActivityMappingContext,
): MappingResult<{
  payload: TaskCreatePayload;
  owner: OwnerResolution;
  unmappedActivityType: string | null;
  completed: boolean;
}> {
  const name = nonBlank(activity.subject) ?? nonBlank(activity.type);
  if (!name) return { skipped: true, reason: "activity has no subject" };

  const owner = resolveOwner(activity.user_id, context.owners);
  const dealId = lookup(context.dealIdByPipedriveId, activity.deal_id);
  const contactId = lookup(context.contactIdByPipedriveId, activity.person_id);
  const organizationId = lookup(context.organizationIdByPipedriveId, activity.org_id);

  const activityType = nonBlank(activity.type);
  const activityKind = mapActivityKind(activityType);
  const dueAt = parseActivityDueAt(activity);
  const durationMinutes = parseActivityDurationMinutes(activity.duration);
  const completed = activity.done === true;

  const lines: string[] = [];
  if (activityType && !activityKind) lines.push(`- Pipedrive activity type: ${activityType}`);
  if (completed) lines.push("- Completed in Pipedrive: yes");

  const body = htmlToMarkdown(activity.note ?? activity.public_description);
  const notes = [lines.join("\n"), body].filter((part) => part !== "").join("\n\n");

  return {
    skipped: false,
    payload: {
      name: clamp(name, 255),
      ...(notes === "" ? {} : { notes }),
      ...(activityKind ? { activityKind } : {}),
      ...(dueAt ? { dueAt: dueAt.toISOString() } : {}),
      ...(durationMinutes === null ? {} : { durationMinutes }),
      userIds: owner.userIds,
      contactIds: contactId ? [contactId] : [],
      organizationIds: organizationId ? [organizationId] : [],
      dealIds: dealId ? [dealId] : [],
      customFieldValues: [{ columnId: context.pipedriveIdColumnId, value: String(activity.id) }],
    },
    owner,
    unmappedActivityType: activityKind ? null : activityType,
    completed,
  };
}

function lookup(index: ReadonlyMap<number, string>, reference: PipedriveReference): string | undefined {
  const id = referenceId(reference);

  return id === null ? undefined : index.get(id);
}

export type NoteOwner =
  | { entity: "deal"; pipedriveId: number }
  | { entity: "contact"; pipedriveId: number }
  | { entity: "organization"; pipedriveId: number };

/** Notes belong to the most specific record they reference: deal, then person, then org. */
export function noteOwner(note: PipedriveNote): NoteOwner | null {
  const dealId = referenceId(note.deal_id);
  if (dealId !== null) return { entity: "deal", pipedriveId: dealId };

  const personId = referenceId(note.person_id);
  if (personId !== null) return { entity: "contact", pipedriveId: personId };

  const organizationId = referenceId(note.org_id);
  if (organizationId !== null) return { entity: "organization", pipedriveId: organizationId };

  return null;
}

export function mapNoteToMarkdown(note: PipedriveNote, authorName: string | null): string {
  const addedAt = parsePipedriveDate(note.add_time);
  const stamp = addedAt ? addedAt.toISOString().slice(0, 10) : "unknown date";
  const author = authorName ?? referenceName(note.user_id) ?? "unknown author";
  const body = htmlToMarkdown(note.content);

  return `**Pipedrive note ${note.id} — ${stamp} — ${author}**\n\n${body === "" ? "_(empty note)_" : body}`;
}

export function parseImportedNoteIds(value: string | null | undefined): Set<string> {
  if (typeof value !== "string") return new Set();

  return new Set(
    value
      .split(MULTI_VALUE_SEPARATOR)
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ""),
  );
}

export function serializeImportedNoteIds(ids: Iterable<string>): string {
  return [...new Set(ids)].sort().join(MULTI_VALUE_SEPARATOR);
}

/** The distinct, non-blank lost reasons a deal export refers to, in stable order. */
export function distinctLostReasons(deals: readonly PipedriveDeal[]): string[] {
  const seen = new Map<string, string>();

  for (const deal of deals) {
    if (parseDealStatus(deal.status) !== "lost") continue;

    const reason = nonBlank(deal.lost_reason);
    if (!reason) continue;

    const key = reason.toLowerCase();
    if (!seen.has(key)) seen.set(key, clamp(reason, 255));
  }

  return [...seen.values()];
}
