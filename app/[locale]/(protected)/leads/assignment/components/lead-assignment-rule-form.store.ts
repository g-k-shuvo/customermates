import type { RootStore } from "@/core/stores/root.store";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { LeadAssignmentRuleDto } from "@/features/lead-assignment/lead-assignment.schema";

import { action, makeObservable, observable, toJS } from "mobx";
import { LeadAssignmentStrategy, Resource } from "@/generated/prisma";

import { createLeadAssignmentRuleAction, updateLeadAssignmentRuleAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { filterRowsFor } from "@/components/data-view/filter-modal/filter-rows";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type LeadAssignmentRuleForm = {
  name: string;
  position: number;
  strategy: LeadAssignmentStrategy;
  userIds: string[];
  conditions: Filter[];
};

const EMPTY: LeadAssignmentRuleForm = {
  name: "",
  position: 0,
  strategy: LeadAssignmentStrategy.roundRobin,
  userIds: [],
  conditions: [],
};

export class LeadAssignmentRuleFormStore extends BaseFormStore<LeadAssignmentRuleForm> {
  ruleId: string | null = null;
  enabled = true;
  filterableFields: FilterableField[] = [];
  customColumns: CustomColumnDto[] = [];

  constructor(rootStore: RootStore) {
    super(rootStore, EMPTY, Resource.company);
    this.withUnsavedChangesGuard = false;

    makeObservable(this, {
      ruleId: observable,
      enabled: observable,
      filterableFields: observable.ref,
      customColumns: observable.ref,
      edit: action,
      setFields: action,
      toggleUser: action,
      setEnabled: action,
    });
  }

  setFields = (filterableFields: FilterableField[], customColumns: CustomColumnDto[]) => {
    this.filterableFields = filterableFields;
    this.customColumns = customColumns;
    this.form.conditions = filterRowsFor(filterableFields, this.form.conditions);
  };

  edit = (rule: LeadAssignmentRuleDto | null, nextPosition: number) => {
    this.ruleId = rule?.id ?? null;
    this.enabled = rule?.enabled ?? true;
    this.onInitOrRefresh({
      name: rule?.name ?? "",
      position: rule?.position ?? nextPosition,
      strategy: rule?.strategy ?? LeadAssignmentStrategy.roundRobin,
      userIds: rule?.userIds ?? [],
      conditions: filterRowsFor(this.filterableFields, rule?.conditions ?? []),
    });
  };

  setEnabled = (enabled: boolean) => {
    this.enabled = enabled;
  };

  toggleUser = (userId: string) => {
    const selected = this.form.userIds.includes(userId);
    const next =
      this.form.strategy === LeadAssignmentStrategy.specificUser
        ? [userId]
        : selected
          ? this.form.userIds.filter((id) => id !== userId)
          : [...this.form.userIds, userId];
    this.onChange("userIds", next);
  };

  save = async (): Promise<boolean> => {
    this.setIsLoading(true);
    try {
      const body = {
        name: this.form.name,
        position: Number(this.form.position) || 0,
        enabled: this.enabled,
        strategy: this.form.strategy,
        userIds: toJS(this.form.userIds),
        conditions: toJS(this.form.conditions).filter(hasValidFilterConfiguration),
      };
      const result = this.ruleId
        ? await updateLeadAssignmentRuleAction({ ...body, id: this.ruleId })
        : await createLeadAssignmentRuleAction(body);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      return true;
    } finally {
      this.setIsLoading(false);
    }
  };
}
