import { z } from "zod";

export const WebFormFieldMappingSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  organizationName: z.string().optional(),
  message: z.string().optional(),
  titleTemplate: z.string().optional(),
});

export type WebFormFieldMapping = z.infer<typeof WebFormFieldMappingSchema>;

export type WebFormMappedFields = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  message: string | null;
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

export function mapWebFormFields(payload: unknown, mapping: WebFormFieldMapping): WebFormMappedFields {
  const read = (path: string | undefined) => (path ? readDotPath(payload, path) : null);

  return {
    firstName: read(mapping.firstName),
    lastName: read(mapping.lastName),
    email: read(mapping.email),
    phone: read(mapping.phone),
    organizationName: read(mapping.organizationName),
    message: read(mapping.message),
  };
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
      .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "")
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
