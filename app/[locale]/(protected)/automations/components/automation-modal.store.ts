import type { RootStore } from "@/core/stores/root.store";
import type { AutomationDto, AutomationTriggerEntityType } from "@/features/automation/automation.schema";
import type { AutomationStepData } from "@/features/automation/automation-action.schema";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityType } from "@/generated/prisma";
import type { AutomationAuthoringOptions } from "./automation-step-fields";

import { action, computed, makeObservable, observable, toJS } from "mobx";
import { AutomationActionKind, AutomationTriggerKind, EntityType as EntityTypes, Resource } from "@/generated/prisma";

import {
  getAutomationAuthoringOptionsAction,
  getAutomationConditionFieldsAction,
  upsertAutomationAction,
} from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { filterRowsFor as rowsFor } from "@/components/data-view/filter-modal/filter-rows";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { automationChangeFields } from "@/features/automation/automation-change-fields";

export type AutomationForm = {
  name: string;
  triggerKind: AutomationTriggerKind;
  entityType: AutomationTriggerEntityType;
  schedule: string;
  steps: AutomationStepData[];
  changedFields: string[];
  conditions: Filter[];
};

export const DEFAULT_STEP: AutomationStepData = {
  kind: AutomationActionKind.createTask,
  config: { name: "", activityKind: null, dueInDays: null, assigneeUserId: null, linkToTriggerRecord: true },
};

const DEFAULT_SCHEDULE = "0 9 * * 1";

const EMPTY: AutomationForm = {
  name: "",
  triggerKind: AutomationTriggerKind.recordCreated,
  entityType: EntityTypes.deal,
  schedule: DEFAULT_SCHEDULE,
  steps: [DEFAULT_STEP],
  changedFields: [],
  conditions: [],
};

let stepKeySequence = 0;

export class AutomationModalStore extends BaseFormStore<AutomationForm> {
  automationId: string | null = null;
  stepKeys: number[] = [];
  fieldsByEntityType: Partial<Record<EntityType, FilterableField[]>> = {};
  customColumnsByEntityType: Partial<Record<EntityType, CustomColumnDto[]>> = {};
  pickerOptions: Pick<AutomationAuthoringOptions, "users" | "pipelines"> = { users: [], pipelines: [] };
  private fieldsRequest: Promise<void> | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY, Resource.automations);

    makeObservable(this, {
      automationId: observable,
      stepKeys: observable,
      fieldsByEntityType: observable.ref,
      customColumnsByEntityType: observable.ref,
      pickerOptions: observable.ref,
      stepOptions: computed,
      isSchedule: computed,
      watchesChanges: computed,
      changeFields: computed,
      filterableFields: computed,
      customColumns: computed,
      open: action,
      addStep: action,
      removeStep: action,
      setStep: action,
      applyFields: action,
      applyPickerOptions: action,
    });
  }

  get stepOptions(): AutomationAuthoringOptions {
    return { ...this.pickerOptions, customColumns: this.customColumns };
  }

  get isSchedule(): boolean {
    return this.form.triggerKind === AutomationTriggerKind.schedule;
  }

  get watchesChanges(): boolean {
    return this.form.triggerKind === AutomationTriggerKind.recordUpdated;
  }

  get changeFields(): string[] {
    return [...automationChangeFields(this.form.entityType), ...this.customColumns.map((column) => column.id)];
  }

  get filterableFields(): FilterableField[] {
    return this.fieldsByEntityType[this.form.entityType] ?? [];
  }

  get customColumns(): CustomColumnDto[] {
    return this.customColumnsByEntityType[this.form.entityType] ?? [];
  }

  open = (automation: AutomationDto | null) => {
    this.automationId = automation?.id ?? null;
    const steps =
      automation && automation.steps.length > 0
        ? automation.steps.map((step) => ({ kind: step.kind, config: step.config }) as AutomationStepData)
        : [DEFAULT_STEP];
    this.stepKeys = steps.map(() => (stepKeySequence += 1));
    this.form = { ...EMPTY, steps: [], changedFields: [], conditions: [] };
    this.onInitOrRefresh({
      name: automation?.name ?? "",
      triggerKind: automation?.triggerKind ?? AutomationTriggerKind.recordCreated,
      entityType: (automation?.entityType as AutomationTriggerEntityType | null) ?? EntityTypes.deal,
      schedule: automation?.schedule ?? DEFAULT_SCHEDULE,
      steps,
      changedFields: automation?.changedFields ?? [],
      conditions: rowsFor(
        this.fieldsByEntityType[(automation?.entityType as EntityType) ?? EntityTypes.deal] ?? [],
        automation?.conditions ?? [],
      ),
    });
  };

  loadFields = async () => {
    this.fieldsRequest ??= Promise.all([
      getAutomationConditionFieldsAction(),
      getAutomationAuthoringOptionsAction(),
    ]).then(([{ filterableFields, customColumns }, pickerOptions]) => {
      const byEntityType: Partial<Record<EntityType, CustomColumnDto[]>> = {};
      for (const column of customColumns) (byEntityType[column.entityType] ??= []).push(column);
      this.applyFields(filterableFields, byEntityType);
      this.applyPickerOptions(pickerOptions);
    });

    await this.fieldsRequest;
  };

  applyFields = (
    fields: Partial<Record<EntityType, FilterableField[]>>,
    customColumns: Partial<Record<EntityType, CustomColumnDto[]>>,
  ) => {
    this.fieldsByEntityType = fields;
    this.customColumnsByEntityType = customColumns;
    const rows = rowsFor(this.filterableFields, this.form.conditions);
    this.form.conditions = rows;
    this.savedState = { ...this.savedState, conditions: rowsFor(this.filterableFields, this.savedState.conditions) };
  };

  applyPickerOptions = (options: Pick<AutomationAuthoringOptions, "users" | "pipelines">) => {
    this.pickerOptions = options;
  };

  protected override afterChange(id: string, value: unknown, previousValue: unknown): void {
    if (id === "entityType" && value !== previousValue) {
      this.form.conditions = rowsFor(this.filterableFields, []);
      this.form.changedFields = [];
    }
    if (id === "triggerKind" && value !== AutomationTriggerKind.recordUpdated) this.form.changedFields = [];
  }

  addStep = () => {
    this.form.steps = [...this.form.steps, DEFAULT_STEP];
    this.stepKeys = [...this.stepKeys, (stepKeySequence += 1)];
  };

  removeStep = (index: number) => {
    this.form.steps = this.form.steps.filter((_, at) => at !== index);
    this.stepKeys = this.stepKeys.filter((_, at) => at !== index);
  };

  setStep = (index: number, step: AutomationStepData) => {
    this.form.steps = this.form.steps.map((current, at) => (at === index ? step : current));
  };

  save = async (): Promise<boolean> => {
    this.setIsLoading(true);
    try {
      const result = await upsertAutomationAction({
        ...(this.automationId ? { id: this.automationId } : {}),
        name: this.form.name,
        triggerKind: this.form.triggerKind,
        entityType: this.isSchedule ? null : this.form.entityType,
        schedule: this.isSchedule ? this.form.schedule : null,
        steps: toJS(this.form.steps),
        changedFields: this.watchesChanges ? toJS(this.form.changedFields) : [],
        conditions: this.isSchedule ? null : toJS(this.form.conditions).filter(hasValidFilterConfiguration),
      });

      if (!result?.ok) {
        toastZodErrorTree(result?.error);
        return false;
      }

      return true;
    } finally {
      this.setIsLoading(false);
    }
  };
}
