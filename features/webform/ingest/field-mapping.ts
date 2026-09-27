import { z } from "zod";

export const WEB_FORM_MAX_CUSTOM_FIELD_MAPPINGS = 50;

export const WebFormCustomFieldMappingSchema = z.object({
  columnId: z.uuid(),
  path: z.string().trim().min(1).max(255),
});
export type WebFormCustomFieldMapping = z.infer<typeof WebFormCustomFieldMappingSchema>;

export const WebFormFieldMappingSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  organizationName: z.string().optional(),
  message: z.string().optional(),
  value: z.string().optional(),
  titleTemplate: z.string().optional(),
  customFields: z.array(WebFormCustomFieldMappingSchema).max(WEB_FORM_MAX_CUSTOM_FIELD_MAPPINGS).optional(),
});

export type WebFormFieldMapping = z.infer<typeof WebFormFieldMappingSchema>;

export type WebFormMappedFields = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  message: string | null;
  value: number | null;
  customFields: { columnId: string; raw: string }[];
};

export function readDotPath(payload: unknown, path: string): string | null {
  let cursor: unknown = payload;

  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  if (cursor === null || cursor === undefined) return null;
  if (typeof cursor === "string") return cursor.trim() || null;
  if (typeof cursor === "number" || typeof cursor === "boolean") return String(cursor);

  return null;
}

export function splitFullName(firstName: string | null, lastName: string | null): [string | null, string | null] {
  if (lastName?.trim()) return [firstName, lastName];

  const whole = firstName?.trim();
  if (!whole) return [firstName, lastName];

  const separator = whole.search(/\s/);
  if (separator === -1) return [whole, lastName];

  return [whole.slice(0, separator), whole.slice(separator + 1).trim() || null];
}

export function mapWebFormFields(payload: unknown, mapping: WebFormFieldMapping): WebFormMappedFields {
  const read = (path: string | undefined) => (path ? readDotPath(payload, path) : null);
  const [firstName, lastName] = splitFullName(read(mapping.firstName), read(mapping.lastName));

  return {
    firstName,
    lastName,
    email: read(mapping.email),
    phone: read(mapping.phone),
    organizationName: read(mapping.organizationName),
    message: read(mapping.message),
    value: parseWebFormAmount(read(mapping.value)),
    customFields: (mapping.customFields ?? []).flatMap(({ columnId, path }) => {
      const raw = readDotPath(payload, path);
      return raw === null ? [] : [{ columnId, raw }];
    }),
  };
}

export function parseWebFormAmount(raw: string | null): number | null {
  if (!raw) return null;

  const compact = raw.replace(/[\s '’]/g, "").replace(/[^\d.,-]/g, "");
  if (!compact) return null;

  let normalized = compact;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) normalized = compact.replaceAll(",", "");
  else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)) normalized = compact.replaceAll(".", "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(compact)) normalized = compact.replace(",", ".");

  const amount = Number(normalized);

  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function renderTitle(
  template: string | undefined,
  fields: WebFormMappedFields,
  context: { formTitle: string | null; sourceName: string },
): string {
  const values: Record<string, string | null> = {
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    organizationName: fields.organizationName,
    form_title: context.formTitle,
    source_name: context.sourceName,
  };

  if (template) {
    const rendered = template
      .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}|\{([a-zA-Z_]+)\}/g, (match, doubleKey?: string, singleKey?: string) => {
        if (doubleKey) return values[doubleKey] ?? "";

        return singleKey && singleKey in values ? (values[singleKey] ?? "") : match;
      })
      .replace(/\s+/g, " ")
      .replace(/^[\s—-]+|[\s—-]+$/g, "")
      .trim();

    if (rendered) return rendered.slice(0, 255);
  }

  const person = [fields.firstName, fields.lastName].filter(Boolean).join(" ").trim();
  const fallback = [person || fields.email || fields.organizationName, context.formTitle || context.sourceName]
    .filter(Boolean)
    .join(" — ");

  return (fallback || context.sourceName).slice(0, 255);
}
