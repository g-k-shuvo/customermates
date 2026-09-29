import type { Filter, FilterableField } from "@/core/base/base-get.schema";

export function filterRowsFor(fields: FilterableField[], current: Filter[]): Filter[] {
  const byField = new Map(
    current.filter((filter) => typeof filter?.field === "string").map((filter) => [filter.field, filter]),
  );
  const known = new Set(fields.map((field) => field.field));
  const rows = fields.map((field) => {
    const existing = byField.get(field.field);

    return (existing
      ? {
          field: existing.field,
          operator: existing.operator,
          ...("value" in existing ? { value: existing.value } : {}),
        }
      : { field: field.field, operator: undefined, value: undefined }) as unknown as Filter;
  });

  return [...rows, ...current.filter((filter) => !known.has(filter.field))];
}
