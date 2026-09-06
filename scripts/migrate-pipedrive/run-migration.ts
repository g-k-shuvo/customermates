/**
 * Orchestrates the migration in the order the PRD requires:
 *
 *   pipelines + stages + lost reasons  (deals cannot be placed without them)
 *   -> organizations -> persons -> deals -> activities -> notes
 *
 * Every write goes through `CrmWrites`, which is either the REST client or the
 * dry-run recorder. Re-running is safe because every imported record carries its
 * Pipedrive id in a `pipedrive_id` custom column, which is also how the final
 * reconciliation counts the target side.
 */

import type { MigrationConfig } from "./config";
import type { CrmCustomColumn, CrmReads, CrmRecord, CrmStage } from "./crm-client";
import type { CrmWrites } from "./crm-writes";
import type { DealCreatePayload, DealFieldBinding, OwnerLookup, TerminalStageNames } from "./mapping";
import type { PipedriveSource } from "./pipedrive-source";
import type {
  PipedriveDeal,
  PipedriveDealField,
  PipedriveDealStatus,
  PipedriveNote,
  PipedrivePipeline,
  PipedriveStage,
} from "./pipedrive.types";
import type { MigrationEntity, ReconciliationReport } from "./reconciliation";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { referenceId } from "./pipedrive.types";

import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";

import {
  DEAL_VALUE_SERVICE_AMOUNT,
  DEAL_VALUE_SERVICE_NAME,
  PIPEDRIVE_ADDRESS_COLUMN,
  PIPEDRIVE_CLOSED_AT_COLUMN,
  PIPEDRIVE_CURRENCY_COLUMN,
  PIPEDRIVE_ID_COLUMN,
  PIPEDRIVE_NOTE_IDS_COLUMN,
  PIPEDRIVE_PHONE_COLUMN,
  PIPEDRIVE_VALUE_COLUMN,
  buildOwnerLookup,
  decideClosingTransition,
  distinctLostReasons,
  isCustomDealField,
  mapActivity,
  mapDeal,
  mapDealFieldToCustomColumn,
  mapNoteToMarkdown,
  mapOrganization,
  mapPerson,
  mapPipeline,
  mapStage,
  noteOwner,
  orderStageChanges,
  parseImportedNoteIds,
  serializeImportedNoteIds,
  sortStagesByOrderNumber,
  stageReplayPlan,
  terminalStages,
} from "./mapping";
import { MigrationLedger } from "./reconciliation";

export type Logger = (message: string) => void;

const ENTITY_PATHS = {
  organization: "organizations",
  contact: "contacts",
  deal: "deals",
  task: "tasks",
} as const;

type ProvisionedColumn = { id: string; existed: boolean };

class ColumnRegistry {
  private readonly cache = new Map<string, CrmCustomColumn[]>();

  constructor(
    private readonly client: CrmReads,
    private readonly writes: CrmWrites,
    private readonly provision: boolean,
    private readonly log: Logger,
  ) {}

  private async list(entityPath: string): Promise<CrmCustomColumn[]> {
    const cached = this.cache.get(entityPath);
    if (cached) return cached;

    const columns = await this.client.customColumns(entityPath);
    this.cache.set(entityPath, columns);

    return columns;
  }

  async ensure(args: {
    entityPath: string;
    entityType: EntityType;
    label: string;
    type: CustomColumnType;
    options?: Record<string, unknown>;
    selectOptions?: { label: string }[];
  }): Promise<ProvisionedColumn> {
    const columns = await this.list(args.entityPath);
    const existing = columns.find((column) => column.label === args.label);
    if (existing) return { id: existing.id, existed: true };

    if (!this.provision) {
      throw new Error(
        `Custom column "${args.label}" is missing on ${args.entityPath} and --skip-column-provisioning was passed.`,
      );
    }

    this.log(`  creating custom column ${args.entityPath}.${args.label} (${args.type})`);
    await this.writes.createCustomColumn({
      entityType: args.entityType,
      type: args.type,
      label: args.label,
      ...(args.options ? { options: args.options } : {}),
      ...(args.selectOptions ? { selectOptions: args.selectOptions } : {}),
    });

    if (this.writes.dryRun) return { id: `dry-run:${args.entityPath}:${args.label}`, existed: false };

    this.cache.delete(args.entityPath);
    const refreshed = await this.list(args.entityPath);
    const created = refreshed.find((column) => column.label === args.label);
    if (!created) throw new Error(`Custom column "${args.label}" was not created on ${args.entityPath}.`);

    return { id: created.id, existed: false };
  }
}

async function buildPipedriveIdIndex(
  client: CrmReads,
  entityPath: string,
  column: ProvisionedColumn,
): Promise<Map<number, CrmRecord>> {
  const index = new Map<number, CrmRecord>();
  if (!column.existed) return index;

  const records = await client.searchAll<CrmRecord>(entityPath, [{ field: column.id, operator: "isNotNull" }]);

  for (const record of records) {
    const raw = record.customFieldValues.find((value) => value.columnId === column.id)?.value;
    const pipedriveId = raw === null || raw === undefined ? Number.NaN : Number(raw);
    if (Number.isFinite(pipedriveId)) index.set(pipedriveId, record);
  }

  return index;
}

type ExistingNotes = { readable: true; markdown: string } | { readable: false };

/**
 * "The record has no notes" and "the record has notes this script cannot read"
 * are different answers: appending to the first is safe, and the second must
 * never be overwritten, so the two are not allowed to collapse into "".
 */
function readExistingNotes(notes: unknown): ExistingNotes {
  if (notes === null || notes === undefined) return { readable: true, markdown: "" };
  if (typeof notes !== "object") return { readable: false };

  try {
    return { readable: true, markdown: serializeJSONToMarkdown(notes).trim() };
  } catch {
    return { readable: false };
  }
}

function limited<T>(records: readonly T[], limit: number | null): T[] {
  return limit === null ? [...records] : records.slice(0, limit);
}

export async function runMigration(args: {
  config: MigrationConfig;
  client: CrmReads;
  writes: CrmWrites;
  source: PipedriveSource;
  log: Logger;
}): Promise<ReconciliationReport> {
  const { config, client, writes, source, log } = args;
  const startedAt = new Date();
  const ledger = new MigrationLedger();
  const columns = new ColumnRegistry(client, writes, config.provisionColumns, log);

  const runs = (entity: MigrationEntity) => config.only === null || config.only.includes(entity);

  log("Reading the target workspace...");
  const [targetUsers, pipedriveUsers] = await Promise.all([client.users(), source.users()]);
  const targetUserIdByEmail = new Map(targetUsers.map((user) => [user.email.trim().toLowerCase(), user.id]));

  let fallbackUserId: string | null = null;
  if (config.fallbackOwnerEmail) {
    fallbackUserId = targetUserIdByEmail.get(config.fallbackOwnerEmail) ?? null;
    if (!fallbackUserId)
      throw new Error(`The nominated fallback owner ${config.fallbackOwnerEmail} is not a user of this workspace.`);
  }

  const owners: OwnerLookup = buildOwnerLookup({ pipedriveUsers, targetUserIdByEmail, fallbackUserId });

  log("Provisioning the pipedrive_* bookkeeping columns...");
  const organizationIdColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.organization,
    entityType: EntityType.organization,
    label: PIPEDRIVE_ID_COLUMN,
    type: CustomColumnType.plain,
  });
  const organizationAddressColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.organization,
    entityType: EntityType.organization,
    label: PIPEDRIVE_ADDRESS_COLUMN,
    type: CustomColumnType.plain,
  });
  const organizationNoteIdsColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.organization,
    entityType: EntityType.organization,
    label: PIPEDRIVE_NOTE_IDS_COLUMN,
    type: CustomColumnType.plain,
  });
  const contactIdColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.contact,
    entityType: EntityType.contact,
    label: PIPEDRIVE_ID_COLUMN,
    type: CustomColumnType.plain,
  });
  const contactPhoneColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.contact,
    entityType: EntityType.contact,
    label: PIPEDRIVE_PHONE_COLUMN,
    type: CustomColumnType.phone,
    options: { color: "secondary", allowMultiple: true },
  });
  const contactNoteIdsColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.contact,
    entityType: EntityType.contact,
    label: PIPEDRIVE_NOTE_IDS_COLUMN,
    type: CustomColumnType.plain,
  });
  const dealIdColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.deal,
    entityType: EntityType.deal,
    label: PIPEDRIVE_ID_COLUMN,
    type: CustomColumnType.plain,
  });
  const dealValueColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.deal,
    entityType: EntityType.deal,
    label: PIPEDRIVE_VALUE_COLUMN,
    type: CustomColumnType.currency,
    options: { currency: config.defaultCurrency },
  });
  const dealCurrencyColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.deal,
    entityType: EntityType.deal,
    label: PIPEDRIVE_CURRENCY_COLUMN,
    type: CustomColumnType.plain,
  });
  const dealClosedAtColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.deal,
    entityType: EntityType.deal,
    label: PIPEDRIVE_CLOSED_AT_COLUMN,
    type: CustomColumnType.dateTime,
  });
  const dealNoteIdsColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.deal,
    entityType: EntityType.deal,
    label: PIPEDRIVE_NOTE_IDS_COLUMN,
    type: CustomColumnType.plain,
  });
  const taskIdColumn = await columns.ensure({
    entityPath: ENTITY_PATHS.task,
    entityType: EntityType.task,
    label: PIPEDRIVE_ID_COLUMN,
    type: CustomColumnType.plain,
  });

  log("Mapping Pipedrive deal fields to custom columns...");
  const dealFields = (await source.dealFields()).filter(isCustomDealField);
  const fieldBindings = await bindDealFields({ dealFields, columns, ledger });

  log("Reading what previous runs already imported...");
  const organizationIndex = await buildPipedriveIdIndex(client, ENTITY_PATHS.organization, organizationIdColumn);
  const contactIndex = await buildPipedriveIdIndex(client, ENTITY_PATHS.contact, contactIdColumn);
  const dealIndex = await buildPipedriveIdIndex(client, ENTITY_PATHS.deal, dealIdColumn);
  const taskIndex = await buildPipedriveIdIndex(client, ENTITY_PATHS.task, taskIdColumn);

  const pipelineIdByPipedriveId = new Map<number, string>();
  const stageIdByPipedriveId = new Map<number, string>();
  const lostReasonIdByName = new Map<string, string>();

  const sourcePipelines = await source.pipelines();
  const sourceStages = await source.stages();
  const sourceDeals = limited(await source.deals(), config.limit);

  if (runs("pipelines") || runs("deals")) {
    log("Creating pipelines and stages...");
    await migratePipelines({
      config,
      client,
      writes,
      ledger,
      sourcePipelines,
      sourceStages,
      pipelineIdByPipedriveId,
      stageIdByPipedriveId,
    });
  }

  if (runs("lostReasons") || runs("deals")) {
    log("Creating lost reasons...");
    await migrateLostReasons({ client, writes, ledger, sourceDeals, lostReasonIdByName });
  }

  const organizationIdByPipedriveId = new Map<number, string>();
  for (const [pipedriveId, record] of organizationIndex) organizationIdByPipedriveId.set(pipedriveId, record.id);

  if (runs("organizations")) {
    log("Migrating organizations...");
    const sourceOrganizations = limited(await source.organizations(), config.limit);
    const tally = ledger.tally("organizations");
    tally.sourceCount = sourceOrganizations.length;

    for (const organization of sourceOrganizations) {
      const mapped = mapOrganization(
        organization,
        {
          pipedriveIdColumnId: organizationIdColumn.id,
          addressColumnId: organizationAddressColumn.id,
        },
        owners,
      );

      if (mapped.skipped) {
        ledger.skip({
          entity: "organizations",
          sourceId: String(organization.id),
          label: String(organization.name ?? ""),
          reason: mapped.reason,
        });
        continue;
      }

      recordOwner(ledger, mapped.owner);

      const existing = organizationIndex.get(organization.id);
      const record = await upsertRecord({
        writes,
        entityPath: ENTITY_PATHS.organization,
        existing,
        payload: mapped.payload,
        updateExisting: config.updateExisting,
        tally,
      });

      organizationIdByPipedriveId.set(organization.id, record.id);
      if (!existing) organizationIndex.set(organization.id, record);
      tally.targetCount += 1;
    }
  }

  const contactIdByPipedriveId = new Map<number, string>();
  for (const [pipedriveId, record] of contactIndex) contactIdByPipedriveId.set(pipedriveId, record.id);

  if (runs("contacts")) {
    log("Migrating persons...");
    const sourcePersons = limited(await source.persons(), config.limit);
    const tally = ledger.tally("contacts");
    tally.sourceCount = sourcePersons.length;

    for (const person of sourcePersons) {
      const mapped = mapPerson(
        person,
        { pipedriveIdColumnId: contactIdColumn.id, phoneColumnId: contactPhoneColumn.id },
        owners,
        organizationIdByPipedriveId,
      );

      if (mapped.skipped) {
        ledger.skip({
          entity: "contacts",
          sourceId: String(person.id),
          label: String(person.name ?? ""),
          reason: mapped.reason,
        });
        continue;
      }

      recordOwner(ledger, mapped.owner);
      if (mapped.missingOrganizationId !== null)
        ledger.unmapped("person.org_id", String(mapped.missingOrganizationId), "organization was not imported");

      const existing = contactIndex.get(person.id);

      try {
        const record = await upsertRecord({
          writes,
          entityPath: ENTITY_PATHS.contact,
          existing,
          payload: mapped.payload,
          updateExisting: config.updateExisting,
          tally,
        });

        contactIdByPipedriveId.set(person.id, record.id);
        if (!existing) contactIndex.set(person.id, record);
        tally.targetCount += 1;
      } catch (error) {
        ledger.skip({
          entity: "contacts",
          sourceId: String(person.id),
          label: String(person.name ?? ""),
          reason: describeError(error),
        });
      }
    }
  }

  const dealIdByPipedriveId = new Map<number, string>();
  for (const [pipedriveId, record] of dealIndex) dealIdByPipedriveId.set(pipedriveId, record.id);

  if (runs("deals")) {
    log("Migrating deals...");
    const valueServiceId = await ensureValueService(client, writes);
    const tally = ledger.tally("deals");
    tally.sourceCount = sourceDeals.length;

    for (const deal of sourceDeals) {
      const mapped = mapDeal(deal, {
        columns: {
          pipedriveIdColumnId: dealIdColumn.id,
          valueColumnId: dealValueColumn.id,
          currencyColumnId: dealCurrencyColumn.id,
          closedAtColumnId: dealClosedAtColumn.id,
        },
        fieldBindings,
        owners,
        organizationIdByPipedriveId,
        contactIdByPipedriveId,
        pipelineIdByPipedriveId,
        stageIdByPipedriveId,
        valueServiceId,
      });

      if (mapped.skipped) {
        ledger.skip({
          entity: "deals",
          sourceId: String(deal.id),
          label: String(deal.title ?? ""),
          reason: mapped.reason,
        });
        continue;
      }

      recordOwner(ledger, mapped.owner);
      for (const warning of mapped.warnings) ledger.unmapped("deal", warning);

      const existing = dealIndex.get(deal.id);
      const currentStatus = readDealStatus(existing);

      try {
        const replay = existing
          ? []
          : stageReplayPlan(
              orderStageChanges(await source.dealFlow(deal.id)),
              stageIdByPipedriveId,
              mapped.payload.stageId,
            );

        const payload = replay.length > 0 ? { ...mapped.payload, stageId: replay[0] } : mapped.payload;

        const record = await upsertRecord({
          writes,
          entityPath: ENTITY_PATHS.deal,
          existing,
          payload: currentStatus === "open" ? payload : withoutStageId(payload),
          updateExisting: config.updateExisting,
          tally,
        });

        dealIdByPipedriveId.set(deal.id, record.id);
        if (!existing) dealIndex.set(deal.id, record);
        tally.targetCount += 1;

        for (const stageId of replay.slice(1)) await writes.updateRecord(ENTITY_PATHS.deal, record.id, { stageId });

        await applyClosingTransition({
          writes,
          ledger,
          dealId: record.id,
          sourceStatus: mapped.status,
          currentStatus,
          lostReason: mapped.lostReason,
          lostReasonIdByName,
        });
      } catch (error) {
        ledger.skip({
          entity: "deals",
          sourceId: String(deal.id),
          label: String(deal.title ?? ""),
          reason: describeError(error),
        });
      }
    }
  }

  if (runs("tasks")) {
    log("Migrating activities as tasks...");
    const sourceActivities = limited(await source.activities(), config.limit);
    const tally = ledger.tally("tasks");
    tally.sourceCount = sourceActivities.length;

    for (const activity of sourceActivities) {
      const mapped = mapActivity(activity, {
        pipedriveIdColumnId: taskIdColumn.id,
        owners,
        dealIdByPipedriveId,
        contactIdByPipedriveId,
        organizationIdByPipedriveId,
      });

      if (mapped.skipped) {
        ledger.skip({
          entity: "tasks",
          sourceId: String(activity.id),
          label: String(activity.subject ?? ""),
          reason: mapped.reason,
        });
        continue;
      }

      recordOwner(ledger, mapped.owner);
      if (mapped.unmappedActivityType) {
        ledger.unmapped(
          "activity.type",
          mapped.unmappedActivityType,
          "not one of the six activity kinds; kept in the task notes",
        );
      }

      if (mapped.completed) {
        ledger.unmapped(
          "activity.done",
          "true",
          "task completion has no write path through the public API; kept in the task notes",
        );
      }

      const existing = taskIndex.get(activity.id);

      try {
        const record = await upsertRecord({
          writes,
          entityPath: ENTITY_PATHS.task,
          existing,
          payload: mapped.payload,
          updateExisting: config.updateExisting,
          tally,
        });

        if (!existing) taskIndex.set(activity.id, record);
        tally.targetCount += 1;
      } catch (error) {
        ledger.skip({
          entity: "tasks",
          sourceId: String(activity.id),
          label: String(activity.subject ?? ""),
          reason: describeError(error),
        });
      }
    }
  }

  if (runs("notes")) {
    log("Migrating notes onto their owning records...");
    await migrateNotes({
      config,
      writes,
      ledger,
      source,
      pipedriveUsers,
      indexes: {
        deal: { records: dealIndex, entityPath: ENTITY_PATHS.deal, noteIdsColumnId: dealNoteIdsColumn.id },
        contact: { records: contactIndex, entityPath: ENTITY_PATHS.contact, noteIdsColumnId: contactNoteIdsColumn.id },
        organization: {
          records: organizationIndex,
          entityPath: ENTITY_PATHS.organization,
          noteIdsColumnId: organizationNoteIdsColumn.id,
        },
      },
    });
  }

  return ledger.report({ dryRun: config.dryRun, startedAt, finishedAt: new Date() });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected failure";
}

function recordOwner(
  ledger: MigrationLedger,
  owner: { unmatched: { pipedriveUserId: number; email: string | null } | null; usedFallback: boolean },
): void {
  if (!owner.unmatched) return;

  ledger.unmapped(
    "owner",
    owner.unmatched.email ?? `pipedrive user ${owner.unmatched.pipedriveUserId}`,
    owner.usedFallback ? "assigned to the nominated fallback owner" : "left unassigned; no fallback owner configured",
  );
}

function readDealStatus(record: CrmRecord | undefined): "open" | "won" | "lost" {
  const status = record?.status;

  return status === "won" || status === "lost" ? status : "open";
}

/**
 * A deal that is already won or lost on the target keeps the stage it was closed
 * in. Writing the source's open stage over it would strand a won deal in an open
 * kanban column, and the closing decision then reads "none" and repairs nothing.
 */
function withoutStageId(payload: DealCreatePayload): DealCreatePayload {
  const rest = { ...payload };
  delete rest.stageId;

  return rest;
}

async function upsertRecord(args: {
  writes: CrmWrites;
  entityPath: string;
  existing: CrmRecord | undefined;
  payload: Record<string, unknown>;
  updateExisting: boolean;
  tally: { created: number; updated: number; unchanged: number };
}): Promise<CrmRecord> {
  const { writes, entityPath, existing, payload, updateExisting, tally } = args;

  if (!existing) {
    const created = await writes.createRecord(entityPath, payload);
    tally.created += 1;

    return created;
  }

  if (!updateExisting) {
    tally.unchanged += 1;

    return existing;
  }

  const updated = await writes.updateRecord(entityPath, existing.id, payload);
  tally.updated += 1;

  return { ...existing, ...updated };
}

async function bindDealFields(args: {
  dealFields: readonly PipedriveDealField[];
  columns: ColumnRegistry;
  ledger: MigrationLedger;
}): Promise<DealFieldBinding[]> {
  const bindings: DealFieldBinding[] = [];

  for (const field of args.dealFields) {
    const key = typeof field.key === "string" ? field.key : "";
    if (key === "") continue;

    const spec = mapDealFieldToCustomColumn(field);
    if (!spec.supported) {
      args.ledger.unmapped("deal field type", spec.fieldType, `field "${spec.label}" has no matching column type`);
      continue;
    }

    const column = await args.columns.ensure({
      entityPath: ENTITY_PATHS.deal,
      entityType: EntityType.deal,
      label: spec.label,
      type: spec.type as CustomColumnType,
      ...(spec.type === "singleSelect" ? { selectOptions: spec.optionLabels.map((label) => ({ label })) } : {}),
    });

    const labelByOptionId = new Map<string, string>();
    for (const option of field.options ?? []) {
      const optionId = option.id;
      const label = option.label;
      if (optionId === null || optionId === undefined || typeof label !== "string") continue;

      labelByOptionId.set(String(optionId), label);
    }

    bindings.push({
      key,
      columnId: column.id,
      fieldType: typeof field.field_type === "string" ? field.field_type : "varchar",
      labelByOptionId,
    });
  }

  return bindings;
}

async function migratePipelines(args: {
  config: MigrationConfig;
  client: CrmReads;
  writes: CrmWrites;
  ledger: MigrationLedger;
  sourcePipelines: readonly PipedrivePipeline[];
  sourceStages: readonly PipedriveStage[];
  pipelineIdByPipedriveId: Map<number, string>;
  stageIdByPipedriveId: Map<number, string>;
}): Promise<void> {
  const { config, client, writes, ledger, sourcePipelines, sourceStages } = args;
  const pipelineTally = ledger.tally("pipelines");
  const stageTally = ledger.tally("stages");

  pipelineTally.sourceCount = sourcePipelines.length;

  const existingPipelines = await client.pipelines();
  const byName = new Map(existingPipelines.map((pipeline) => [pipeline.name.trim().toLowerCase(), pipeline]));

  const ordered = [...sourcePipelines].sort((a, b) => (a.order_nr ?? 0) - (b.order_nr ?? 0) || a.id - b.id);

  for (const [index, pipeline] of ordered.entries()) {
    const stagesOfPipeline = sourceStages.filter((stage) => referenceId(stage.pipeline_id) === pipeline.id);
    stageTally.sourceCount += stagesOfPipeline.length;

    const mapped = mapPipeline(pipeline, stagesOfPipeline, {
      isDefault: config.makeFirstPipelineDefault && index === 0,
      terminalNames: { won: config.wonStageName, lost: config.lostStageName },
    });

    if (mapped.skipped) {
      ledger.skip({
        entity: "pipelines",
        sourceId: String(pipeline.id),
        label: String(pipeline.name ?? ""),
        reason: mapped.reason,
      });
      continue;
    }

    const key = mapped.payload.name.trim().toLowerCase();
    let target = byName.get(key);

    if (target) pipelineTally.unchanged += 1;
    else {
      target = await writes.createPipeline(mapped.payload);
      byName.set(key, target);
      pipelineTally.created += 1;
    }

    pipelineTally.targetCount += 1;
    args.pipelineIdByPipedriveId.set(pipeline.id, target.id);

    const targetStages = [...target.stages];
    const stageByName = new Map(targetStages.map((stage) => [stage.name.trim().toLowerCase(), stage]));
    let nextPosition = targetStages.reduce((highest, stage) => Math.max(highest, stage.position + 1), 0);

    for (const stage of sortStagesByOrderNumber(stagesOfPipeline)) {
      const mappedStage = mapStage(stage);
      if (!mappedStage) {
        ledger.skip({
          entity: "stages",
          sourceId: String(stage.id),
          label: "",
          reason: "stage has no name",
        });
        continue;
      }

      let targetStage = stageByName.get(mappedStage.name.toLowerCase());

      if (!targetStage) {
        targetStage = await writes.createStage(target.id, {
          name: mappedStage.name,
          position: nextPosition,
          probability: mappedStage.probability,
          ...(mappedStage.rottingDays === null ? {} : { rottingDays: mappedStage.rottingDays }),
          kind: mappedStage.kind,
        });
        nextPosition += 1;
        targetStages.push(targetStage);
        stageByName.set(mappedStage.name.toLowerCase(), targetStage);
        stageTally.created += 1;
      } else stageTally.unchanged += 1;

      args.stageIdByPipedriveId.set(stage.id, targetStage.id);
      stageTally.targetCount += 1;
    }

    await ensureTerminalStages({
      writes,
      pipelineId: target.id,
      stages: targetStages,
      nextPosition,
      terminalNames: { won: config.wonStageName, lost: config.lostStageName },
    });
  }
}

/**
 * A pipeline created by this run gets its Won/Lost pair from `mapPipeline`, but a
 * pipeline that already existed on the target does not — and without a terminal
 * stage of each kind the closing transitions have nowhere to move a closed deal.
 * The kind, not the name, decides: a pipeline is allowed one stage of each.
 */
async function ensureTerminalStages(args: {
  writes: CrmWrites;
  pipelineId: string;
  stages: CrmStage[];
  nextPosition: number;
  terminalNames: TerminalStageNames;
}): Promise<void> {
  const { writes, pipelineId, stages, terminalNames } = args;
  let nextPosition = args.nextPosition;

  for (const terminal of terminalStages(terminalNames)) {
    if (stages.some((stage) => stage.kind === terminal.kind)) continue;

    const created = await writes.createStage(pipelineId, {
      name: terminal.name,
      position: nextPosition,
      probability: terminal.probability,
      kind: terminal.kind,
    });

    nextPosition += 1;
    stages.push(created);
  }
}

async function migrateLostReasons(args: {
  client: CrmReads;
  writes: CrmWrites;
  ledger: MigrationLedger;
  sourceDeals: readonly PipedriveDeal[];
  lostReasonIdByName: Map<string, string>;
}): Promise<void> {
  const { client, writes, ledger, sourceDeals, lostReasonIdByName } = args;
  const tally = ledger.tally("lostReasons");
  const reasons = distinctLostReasons(sourceDeals);
  tally.sourceCount = reasons.length;

  const existing = await client.lostReasons();
  for (const reason of existing) lostReasonIdByName.set(reason.name.trim().toLowerCase(), reason.id);

  for (const [index, reason] of reasons.entries()) {
    const key = reason.toLowerCase();
    const known = lostReasonIdByName.get(key);

    if (known) tally.unchanged += 1;
    else {
      const created = await writes.createLostReason({ name: reason, position: existing.length + index });
      lostReasonIdByName.set(key, created.id);
      tally.created += 1;
    }

    tally.targetCount += 1;
  }
}

async function ensureValueService(client: CrmReads, writes: CrmWrites): Promise<string | null> {
  const services = await client.services();
  const existing = services.find((service) => service.name === DEAL_VALUE_SERVICE_NAME);
  if (existing) return existing.id;

  const created = await writes.createService({ name: DEAL_VALUE_SERVICE_NAME, amount: DEAL_VALUE_SERVICE_AMOUNT });

  return created.id;
}

/**
 * The deal itself is already written by the time this runs, so a transition that
 * cannot be made is an unmapped *value*, never a skipped *record* — counting it
 * as skipped would report a mismatch for a deal that did in fact land.
 */
async function applyClosingTransition(args: {
  writes: CrmWrites;
  ledger: MigrationLedger;
  dealId: string;
  sourceStatus: PipedriveDealStatus;
  currentStatus: "open" | "won" | "lost";
  lostReason: string | null;
  lostReasonIdByName: ReadonlyMap<string, string>;
}): Promise<void> {
  const { writes, ledger, dealId, sourceStatus, currentStatus, lostReason, lostReasonIdByName } = args;
  const lostReasonId = lostReason ? lostReasonIdByName.get(lostReason.toLowerCase()) : undefined;

  const decision = decideClosingTransition({
    sourceStatus,
    currentStatus,
    hasLostReason: Boolean(lostReasonId),
  });

  if (decision.action === "none") return;

  if (decision.action === "skip") {
    if (lostReason && !lostReasonId) ledger.unmapped("deal.lost_reason", lostReason, "no matching LostReason");
    ledger.unmapped("deal.closing_transition", decision.reason, "the deal was imported and left open");
    return;
  }

  if (decision.action === "reopen") {
    await writes.reopenDeal(dealId);
    return;
  }

  if (decision.action === "reopenThenWin" || decision.action === "reopenThenLose") await writes.reopenDeal(dealId);

  if (decision.action === "won" || decision.action === "reopenThenWin") {
    await writes.markDealWon(dealId);
    return;
  }

  if (!lostReasonId) return;

  await writes.markDealLost(dealId, { lostReasonId });
}

type NoteTargetIndex = {
  records: Map<number, CrmRecord>;
  entityPath: string;
  noteIdsColumnId: string;
};

async function migrateNotes(args: {
  config: MigrationConfig;
  writes: CrmWrites;
  ledger: MigrationLedger;
  source: PipedriveSource;
  pipedriveUsers: readonly { id: number; name?: string | null }[];
  indexes: Record<"deal" | "contact" | "organization", NoteTargetIndex>;
}): Promise<void> {
  const { writes, ledger, source, indexes } = args;
  const tally = ledger.tally("notes");
  const notes = limited(await source.notes(), args.config.limit);
  tally.sourceCount = notes.length;

  const authorById = new Map(
    args.pipedriveUsers.flatMap((user) => (typeof user.name === "string" ? [[user.id, user.name] as const] : [])),
  );

  const grouped = new Map<string, { index: NoteTargetIndex; record: CrmRecord; notes: PipedriveNote[] }>();

  for (const note of notes) {
    const owner = noteOwner(note);
    if (!owner) {
      ledger.skip({
        entity: "notes",
        sourceId: String(note.id),
        label: "",
        reason: "note is not attached to a deal, person or organization",
      });
      continue;
    }

    const index = indexes[owner.entity];
    const record = index.records.get(owner.pipedriveId);
    if (!record) {
      ledger.skip({
        entity: "notes",
        sourceId: String(note.id),
        label: "",
        reason: `owning ${owner.entity} ${owner.pipedriveId} was not imported`,
      });
      continue;
    }

    const key = `${owner.entity}:${record.id}`;
    const bucket = grouped.get(key) ?? { index, record, notes: [] };
    bucket.notes.push(note);
    grouped.set(key, bucket);
  }

  for (const bucket of grouped.values()) {
    const alreadyImported = parseImportedNoteIds(
      bucket.record.customFieldValues.find((value) => value.columnId === bucket.index.noteIdsColumnId)?.value,
    );

    const fresh = bucket.notes.filter((note) => !alreadyImported.has(String(note.id)));
    tally.unchanged += bucket.notes.length - fresh.length;
    tally.targetCount += bucket.notes.length - fresh.length;

    if (fresh.length === 0) continue;

    const existingNotes = readExistingNotes(bucket.record.notes);
    if (!existingNotes.readable) {
      for (const note of fresh) {
        ledger.skip({
          entity: "notes",
          sourceId: String(note.id),
          label: "",
          reason: `the notes already on ${bucket.index.entityPath} ${bucket.record.id} could not be read, and appending would replace them`,
        });
      }
      continue;
    }

    const blocks = fresh.map((note) =>
      mapNoteToMarkdown(note, authorById.get(referenceId(note.user_id) ?? Number.NaN) ?? null),
    );
    const markdown = [existingNotes.markdown, ...blocks].filter((part) => part !== "").join("\n\n");

    try {
      await writes.updateRecord(bucket.index.entityPath, bucket.record.id, {
        notes: markdown,
        customFieldValues: [
          {
            columnId: bucket.index.noteIdsColumnId,
            value: serializeImportedNoteIds([...alreadyImported, ...fresh.map((note) => String(note.id))]),
          },
        ],
      });

      tally.created += fresh.length;
      tally.targetCount += fresh.length;
    } catch (error) {
      for (const note of fresh)
        ledger.skip({ entity: "notes", sourceId: String(note.id), label: "", reason: describeError(error) });
    }
  }
}
