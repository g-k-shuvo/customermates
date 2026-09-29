import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { LeadConditionValidator } from "./upsert/upsert-lead-assignment-rule.interactor";

export type LeadFilterSource = {
  getFilterableFields(): Promise<FilterableField[]>;
  validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }): Filter[];
};

export class LeadConditionCheck implements LeadConditionValidator {
  constructor(private leads: LeadFilterSource) {}

  async invalidLeadConditions(conditions: Filter[]): Promise<boolean> {
    if (conditions.length === 0) return false;

    const filterableFields = await this.leads.getFilterableFields();

    return this.leads.validateFilters({ filters: conditions, filterableFields }).length !== conditions.length;
  }
}
