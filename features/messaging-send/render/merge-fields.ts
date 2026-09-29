export const MERGE_FIELDS = [
  "contact.firstName",
  "contact.lastName",
  "contact.fullName",
  "contact.email",
  "organization.name",
  "deal.name",
  "sender.firstName",
  "sender.lastName",
  "sender.fullName",
  "sender.email",
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number];

export const UNMERGEABLE_FIELDS: ReadonlySet<string> = new Set([
  "contact.notes",
  "contact.customFieldValues",
  "contact.phone",
  "organization.notes",
  "deal.notes",
  "deal.totalValue",
  "sender.passwordHash",
  "sender.sessionToken",
  "sender.apiKey",
]);

export type MergeValues = Partial<Record<MergeField, string | null>>;

export type MergeFailure =
  | { code: "unknownMergeField"; field: string }
  | { code: "missingMergeValue"; field: MergeField }
  | { code: "malformedMergeField"; field: string };

export type MergeResult = { ok: true; value: string } | { ok: false; failure: MergeFailure };

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;
const FIELD = /^\s*([a-z]+\.[A-Za-z]+)\s*(?:\|\s*"([^"]*)"\s*)?$/;
const KNOWN: ReadonlySet<string> = new Set(MERGE_FIELDS);

export type MergePlaceholder = { raw: string; field: MergeField; fallback: string | null };

export function parseMergePlaceholders(
  template: string,
): { ok: true; placeholders: MergePlaceholder[] } | { ok: false; failure: MergeFailure } {
  const placeholders: MergePlaceholder[] = [];

  for (const match of template.matchAll(PLACEHOLDER)) {
    const parsed = FIELD.exec(match[1] ?? "");
    if (!parsed) return { ok: false, failure: { code: "malformedMergeField", field: match[0] } };

    const field = parsed[1] ?? "";
    if (UNMERGEABLE_FIELDS.has(field) || !KNOWN.has(field))
      return { ok: false, failure: { code: "unknownMergeField", field } };

    placeholders.push({ raw: match[0], field: field as MergeField, fallback: parsed[2] ?? null });
  }

  if (/\{\{|\}\}/.test(template.replace(PLACEHOLDER, "")))
    return { ok: false, failure: { code: "malformedMergeField", field: "{{" } };

  return { ok: true, placeholders };
}

export function mergeValueFor(placeholder: MergePlaceholder, values: MergeValues): MergeResult {
  const value = values[placeholder.field]?.trim();
  if (value) return { ok: true, value };
  if (placeholder.fallback !== null) return { ok: true, value: placeholder.fallback };

  return { ok: false, failure: { code: "missingMergeValue", field: placeholder.field } };
}

export function fullName(first: string | null | undefined, last: string | null | undefined): string | null {
  const name = [first?.trim(), last?.trim()].filter(Boolean).join(" ");

  return name === "" ? null : name;
}

export function mergeValuesFrom(source: {
  contact: { firstName: string; lastName: string; email: string | null } | null;
  organizationName: string | null;
  dealName: string | null;
  sender: { firstName: string; lastName: string; email: string } | null;
}): MergeValues {
  return {
    "contact.firstName": source.contact?.firstName ?? null,
    "contact.lastName": source.contact?.lastName ?? null,
    "contact.fullName": fullName(source.contact?.firstName, source.contact?.lastName),
    "contact.email": source.contact?.email ?? null,
    "organization.name": source.organizationName,
    "deal.name": source.dealName,
    "sender.firstName": source.sender?.firstName ?? null,
    "sender.lastName": source.sender?.lastName ?? null,
    "sender.fullName": fullName(source.sender?.firstName, source.sender?.lastName),
    "sender.email": source.sender?.email ?? null,
  };
}
