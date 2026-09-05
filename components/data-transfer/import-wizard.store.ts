import type { CatalogIndex, ImportPlan, PlanRow, RelationIndex } from "@/features/data-transfer/import/import-plan";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DuplicateKeyColumn } from "@/features/data-transfer/import/duplicate-plan";
import type { DuplicateStrategy } from "@/features/data-transfer/data-transfer.schema";
import type { ImportRowIssue } from "@/features/data-transfer/import/import-issues";
import type { MappingTarget } from "@/features/data-transfer/import/import-mapping";
import type { ParsedWorkbook } from "@/features/data-transfer/import/read-workbook-file";
import type { RootStore } from "@/core/stores/root.store";

import { makeObservable, observable, action, computed, runInAction } from "mobx";
import { EntityType } from "@/generated/prisma";

import { reportApplicationError } from "@/core/errors/report-application-error";

import { getCustomColumnsByEntityTypeAction } from "@/app/actions";
import {
  commitImportChunkAction,
  dryRunImportChunkAction,
  getImportRelationIndexAction,
  matchImportKeysAction,
} from "@/app/[locale]/(protected)/data-transfer/actions";
import {
  CHANNELS_SHEET_NAME,
  IMPORT_CHUNK_SIZE,
  IMPORT_KEY_MATCH_BATCH,
  IMPORT_KEY_VALUE_MAX_LENGTH,
  SERVICES_SHEET_NAME,
  type ImportMode,
} from "@/features/data-transfer/data-transfer.schema";
import {
  applyDuplicateStrategy,
  duplicateKeyColumns,
  duplicateKeysBySheetRow,
} from "@/features/data-transfer/import/duplicate-plan";
import { buildPipelineCatalogIndex } from "@/features/data-transfer/import/pipeline-catalog";
import { IMPORT_ENTITIES } from "@/features/data-transfer/import/import-entity.registry";
import { isDemoEnvironment } from "@/core/errors/report-application-error";
import { ImportFileError } from "@/features/data-transfer/import/read-workbook-file";
import { readImportFile } from "@/features/data-transfer/import/read-import-file";
import {
  autoMatchColumns,
  duplicateTargets,
  mappingFromSchemaSheet,
} from "@/features/data-transfer/import/import-mapping";
import {
  buildPlan,
  chunkRows,
  dealServicesBySheetRow,
  identifiersBySheetRow,
} from "@/features/data-transfer/import/import-plan";
import {
  attributeIssueColumn,
  dedupeIssues,
  mapFailureToRows,
  planIssueToRowIssue,
} from "@/features/data-transfer/import/import-issues";
import { BaseModalStore } from "@/core/base/base-modal.store";

export type ImportStep = "file" | "mapping" | "preview" | "result";

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  notAttempted: number;
  stoppedAtSheetRow: number | null;
};

const RELATION_TARGETS: Record<string, EntityType> = {
  contact: EntityType.contact,
  deal: EntityType.deal,
  organization: EntityType.organization,
  service: EntityType.service,
  task: EntityType.task,
};

function duplicateLookupFailure(column: DuplicateKeyColumn): ImportRowIssue {
  return {
    sheetRow: null,
    columnLetter: column.letter,
    columnLabel: column.header,
    fieldPath: "",
    message: "",
    values: {},
    code: "duplicateLookupFailed",
    blocking: true,
  };
}

export class ImportWizardStore extends BaseModalStore {
  entityType: EntityType = EntityType.contact;
  step: ImportStep = "file";
  fileName = "";
  parsed?: ParsedWorkbook;
  mapping: MappingTarget[] = [];
  customColumns: CustomColumnDto[] = [];
  relationIndex: RelationIndex = {};
  catalogIndex: CatalogIndex = {};
  plan?: ImportPlan;
  issues: ImportRowIssue[] = [];
  summary?: ImportSummary;
  progressDone = 0;
  progressTotal = 0;
  fileError: string | null = null;
  skipInvalid = false;
  duplicateStrategy: DuplicateStrategy = "create";
  duplicateKeyIndex: number | null = null;
  private onComplete?: () => Promise<void> | void;

  constructor(rootStore: RootStore) {
    super(rootStore, {});

    makeObservable(this, {
      entityType: observable,
      step: observable,
      fileName: observable,
      parsed: observable.ref,
      mapping: observable,
      customColumns: observable.ref,
      relationIndex: observable.ref,
      catalogIndex: observable.ref,
      plan: observable.ref,
      issues: observable.ref,
      summary: observable.ref,
      progressDone: observable,
      progressTotal: observable,
      fileError: observable,
      skipInvalid: observable,
      duplicateStrategy: observable,
      duplicateKeyIndex: observable,

      descriptor: computed,
      hasBlockingIssues: computed,
      invalidSheetRows: computed,
      skippableCount: computed,
      duplicateTargetCount: computed,
      duplicateKeyColumns: computed,
      duplicateKeyColumn: computed,

      openForEntity: action,
      reset: action,
      setStep: action,
      setTarget: action,
      setSkipInvalid: action,
      setDuplicateStrategy: action,
      setDuplicateKeyIndex: action,
    });
  }

  get descriptor() {
    return IMPORT_ENTITIES[this.entityType];
  }

  get duplicateTargetCount(): number {
    return duplicateTargets(this.mapping).length;
  }

  get duplicateKeyColumns(): DuplicateKeyColumn[] {
    return duplicateKeyColumns({
      sources: this.parsed?.sources ?? [],
      mapping: this.mapping,
      entityType: this.entityType,
    });
  }

  get duplicateKeyColumn(): DuplicateKeyColumn | null {
    return this.duplicateKeyColumns.find((column) => column.index === this.duplicateKeyIndex) ?? null;
  }

  get invalidSheetRows(): Set<number> {
    return new Set(this.issues.flatMap((issue) => (issue.blocking && issue.sheetRow !== null ? [issue.sheetRow] : [])));
  }

  get skippableCount(): number {
    if (!this.plan) return 0;

    return this.invalidSheetRows.size;
  }

  get hasBlockingIssues(): boolean {
    if (!this.issues.some((issue) => issue.blocking)) return false;

    return !this.skipInvalid || this.skippableCount === 0;
  }

  reset = () => {
    this.step = "file";
    this.fileName = "";
    this.parsed = undefined;
    this.mapping = [];
    this.catalogIndex = {};
    this.plan = undefined;
    this.issues = [];
    this.summary = undefined;
    this.setIsLoading(false);
    this.progressDone = 0;
    this.progressTotal = 0;
    this.fileError = null;
    this.skipInvalid = false;
    this.duplicateStrategy = "create";
    this.duplicateKeyIndex = null;
  };

  setStep = (step: ImportStep) => {
    this.step = step;
  };

  setSkipInvalid = (value: boolean) => {
    this.skipInvalid = value;
  };

  setDuplicateStrategy = (strategy: DuplicateStrategy) => {
    this.duplicateStrategy = strategy;
  };

  setDuplicateKeyIndex = (index: number | null) => {
    this.duplicateKeyIndex = index;
    if (index === null) this.duplicateStrategy = "create";
  };

  setTarget = (index: number, target: MappingTarget) => {
    this.mapping = this.mapping.map((current, position) => (position === index ? target : current));
  };

  protected override prepareToClose(): boolean {
    if (this.isLoading) return false;

    this.reset();
    return true;
  }

  openForEntity = (entityType: EntityType, onComplete?: () => Promise<void> | void) => {
    this.reset();
    this.entityType = entityType;
    this.onComplete = onComplete;
    this.open();
  };

  selectFile = async (file: File) => {
    this.setIsLoading(true);
    this.setFileError(null);

    try {
      const parsed = await readImportFile(file);
      const customColumns = await getCustomColumnsByEntityTypeAction({ entityType: this.entityType });

      const targets = new Set(
        this.descriptor.fields.flatMap((field) => (field.relationTarget ? [field.relationTarget] : [])),
      );
      const relationTypes = [...targets].flatMap((target) => (target === "user" ? [] : [RELATION_TARGETS[target]]));

      const relations = await getImportRelationIndexAction({
        entityTypes: relationTypes,
        includeUsers: targets.has("user"),
      });
      if (!relations.ok) throw new ImportFileError("relationsUnavailable");

      const relationIndex: RelationIndex = {};

      for (const [key, entries] of Object.entries(relations.data.index)) {
        const map = new Map<string, string[]>();
        for (const [label, id] of entries) map.set(label, [...(map.get(label) ?? []), id]);
        relationIndex[key] = map;
      }

      const catalogIndex = await this.loadCatalogIndex();
      const fromSchema = mappingFromSchemaSheet(parsed.sources, parsed.schemaRows, this.descriptor, customColumns);

      this.applyParsed(
        file.name,
        parsed,
        customColumns,
        relationIndex,
        catalogIndex,
        fromSchema ?? autoMatchColumns(parsed.sources, this.descriptor, customColumns),
      );
    } catch (error) {
      if (isDemoEnvironment()) this.setFileError("demoBlocked");
      else this.setFileError(error instanceof ImportFileError ? error.reason : "unreadable");
    } finally {
      this.setIsLoading(false);
    }
  };

  loadCatalogIndex = async (): Promise<CatalogIndex> => {
    if (!this.descriptor.fields.some((field) => field.catalogTarget)) return {};

    const dealsStore = this.rootStore.dealsStore;
    await dealsStore.ensurePipelinesLoaded();

    return buildPipelineCatalogIndex(dealsStore.pipelines, dealsStore.stages);
  };

  resolveDuplicates = async (plan: ImportPlan): Promise<{ plan: ImportPlan; issues: ImportRowIssue[] }> => {
    const column = this.duplicateKeyColumn;
    if (!column || this.duplicateStrategy === "create" || plan.create.length === 0) return { plan, issues: [] };

    const keysBySheetRow = duplicateKeysBySheetRow(this.parsed?.rows ?? [], column.index);
    const usable = (value: string | undefined): value is string =>
      value !== undefined && value.length <= IMPORT_KEY_VALUE_MAX_LENGTH;
    const values = [...new Set(plan.create.map((row) => keysBySheetRow.get(row.sheetRow)).filter(usable))];
    if (values.length === 0) return { plan, issues: [] };

    const matches = new Map<string, string[]>();

    for (const batch of chunkRows(values, IMPORT_KEY_MATCH_BATCH)) {
      const result = await matchImportKeysAction({ entityType: this.entityType, key: column.key, values: batch });

      if (!result.ok) return { plan, issues: [duplicateLookupFailure(column)] };

      for (const [value, ids] of result.data.matches) matches.set(value, ids);
    }

    return {
      plan: applyDuplicateStrategy({ plan, strategy: this.duplicateStrategy, column, keysBySheetRow, matches }),
      issues: [],
    };
  };

  runDryRun = async () => {
    if (!this.parsed) return;

    const parsedPlan = buildPlan({
      rows: this.parsed.rows,
      sources: this.parsed.sources,
      mapping: this.mapping,
      descriptor: this.descriptor,
      customColumns: this.customColumns,
      relationIndex: this.relationIndex,
      catalogIndex: this.catalogIndex,
      identifiersByRow: identifiersBySheetRow(this.parsed.relationSheets[CHANNELS_SHEET_NAME] ?? []),
      dealServicesByRow: dealServicesBySheetRow(this.parsed.relationSheets[SERVICES_SHEET_NAME] ?? []),
    });

    this.setIsLoading(true);
    this.setProgress(0, 0);

    try {
      const resolved = await this.resolveDuplicates(parsedPlan);
      const plan = resolved.plan;
      const updateChunks = chunkRows(plan.update, IMPORT_CHUNK_SIZE);
      const createChunks = chunkRows(plan.create, IMPORT_CHUNK_SIZE);

      this.setProgress(0, updateChunks.length + createChunks.length);

      const found: ImportRowIssue[] = [...plan.issues.map(planIssueToRowIssue), ...resolved.issues];

      for (const [mode, chunks] of [
        ["update", updateChunks],
        ["create", createChunks],
      ] as Array<[ImportMode, PlanRow[][]]>) {
        for (const chunk of chunks) {
          const result = await dryRunImportChunkAction({
            entityType: this.entityType,
            mode,
            rows: chunk.map((row) => row.payload),
          });

          if (!result.ok) found.push(...mapFailureToRows(result.failure, chunk, this.descriptor.collectionKey));

          this.setProgress(this.progressDone + 1, this.progressTotal);
        }
      }

      this.applyPlan(plan, this.attribute(dedupeIssues(found)));
    } finally {
      this.setIsLoading(false);
    }
  };

  commit = async () => {
    const plan = this.plan;
    if (!plan) return;

    const invalid = this.skipInvalid ? this.invalidSheetRows : new Set<number>();
    const keep = (row: PlanRow) => !invalid.has(row.sheetRow);
    const updateRows = plan.update.filter(keep);
    const createRows = plan.create.filter(keep);
    const attempted = updateRows.length + createRows.length;
    const skipped = (this.parsed?.rows.length ?? plan.update.length + plan.create.length) - attempted;

    const updateChunks = chunkRows(updateRows, IMPORT_CHUNK_SIZE);
    const createChunks = chunkRows(createRows, IMPORT_CHUNK_SIZE);
    const total = attempted;

    this.setIsLoading(true);
    this.setProgress(0, updateChunks.length + createChunks.length);

    let created = 0;
    let updated = 0;
    let stoppedAtSheetRow: number | null = null;
    const failures: ImportRowIssue[] = [];

    try {
      for (const [mode, chunks] of [
        ["update", updateChunks],
        ["create", createChunks],
      ] as Array<[ImportMode, PlanRow[][]]>) {
        for (const chunk of chunks) {
          if (stoppedAtSheetRow !== null) break;

          let result: Awaited<ReturnType<typeof commitImportChunkAction>>;

          try {
            result = await commitImportChunkAction({
              entityType: this.entityType,
              mode,
              rows: chunk.map((row) => row.payload),
            });
          } catch (error) {
            reportApplicationError(error);
            stoppedAtSheetRow = chunk[0]?.sheetRow ?? null;
            break;
          }

          if (!result.ok) {
            failures.push(...mapFailureToRows(result.failure, chunk, this.descriptor.collectionKey));
            stoppedAtSheetRow = chunk[0]?.sheetRow ?? null;
            break;
          }

          if (mode === "create") created += result.ids.length;
          else updated += chunk.length;

          this.setProgress(this.progressDone + 1, this.progressTotal);
        }
      }

      const carried = this.skipInvalid ? this.issues : this.issues.filter((issue) => !issue.blocking);

      this.applySummary(
        { created, updated, skipped, notAttempted: total - created - updated, stoppedAtSheetRow },
        this.attribute(dedupeIssues([...failures, ...carried])),
      );
    } finally {
      this.setIsLoading(false);
      await this.onComplete?.();
    }
  };

  private attribute = (issues: ImportRowIssue[]): ImportRowIssue[] => {
    const sources = this.parsed?.sources;
    if (!sources) return issues;

    return issues.map((issue) => {
      if (issue.columnLabel) return issue;

      const found = attributeIssueColumn(issue.fieldPath, this.mapping, sources);
      return found ? { ...issue, ...found } : issue;
    });
  };

  private setFileError(value: string | null) {
    runInAction(() => {
      this.fileError = value;
    });
  }

  private setProgress(done: number, total: number) {
    runInAction(() => {
      this.progressDone = done;
      this.progressTotal = total;
    });
  }

  private applyParsed(
    fileName: string,
    parsed: ParsedWorkbook,
    customColumns: CustomColumnDto[],
    relationIndex: RelationIndex,
    catalogIndex: CatalogIndex,
    mapping: MappingTarget[],
  ) {
    runInAction(() => {
      this.fileName = fileName;
      this.parsed = parsed;
      this.customColumns = customColumns;
      this.relationIndex = relationIndex;
      this.catalogIndex = catalogIndex;
      this.mapping = mapping;
      this.duplicateKeyIndex = null;
      this.duplicateStrategy = "create";
      this.step = "mapping";
    });
  }

  private applyPlan(plan: ImportPlan, issues: ImportRowIssue[]) {
    runInAction(() => {
      this.plan = plan;
      this.issues = issues;
      this.step = "preview";
    });
  }

  private applySummary(summary: ImportSummary, issues: ImportRowIssue[]) {
    runInAction(() => {
      this.summary = summary;
      this.issues = issues;
      this.step = "result";
    });
  }
}
