import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType, MessagingProvider } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { IMPORT_ENTITIES, IMPORT_KEY_FIELDS } from "./import/import-entity.registry";

export const SCHEMA_SHEET_NAME = "Schema";

export const CHANNELS_SHEET_NAME = "Channels";

export const SERVICES_SHEET_NAME = "Services";

export const EXPORT_PAGE_SIZE = 500;

export const EXPORT_ROW_LIMIT = 50_000;

export const RequestedColumnSchema = z.object({
  key: z.string().trim().min(1).max(200),
  header: z.string().max(300),
});
export type RequestedColumnInput = Data<typeof RequestedColumnSchema>;

export const ExportRecordsPageSchema = z.object({
  entityType: z.enum(EntityType),
  columns: z.array(RequestedColumnSchema).min(1).max(200),
  filters: z.array(FilterSchema).optional(),
  searchTerm: z.string().max(500).optional(),
  sortDescriptor: SortDescriptorSchema.optional(),
  selectedIds: z.array(z.uuid()).max(EXPORT_ROW_LIMIT).optional(),
  skip: z.number().int().min(0).max(EXPORT_ROW_LIMIT),
  take: z.number().int().min(1).max(EXPORT_PAGE_SIZE),
});
export type ExportRecordsPageData = Data<typeof ExportRecordsPageSchema>;

export const ExportRequestSchema = ExportRecordsPageSchema.omit({ skip: true, take: true, entityType: true });
export type ExportRequestData = Data<typeof ExportRequestSchema>;

export const IMPORT_CHUNK_SIZE = 100;

export const IMPORT_ROW_LIMIT = 10_000;

export const ImportModeSchema = z.enum(["create", "update"]);
export type ImportMode = Data<typeof ImportModeSchema>;

export const DryRunImportSchema = z.object({
  mode: ImportModeSchema,
  rows: z.array(z.unknown()).min(1).max(IMPORT_CHUNK_SIZE),
});
export type DryRunImportData = Data<typeof DryRunImportSchema>;

export const ImportChunkSchema = DryRunImportSchema.extend({ entityType: z.enum(EntityType) });
export type ImportChunkData = Data<typeof ImportChunkSchema>;

export const RELATION_INDEX_LIMIT = 5000;

export const RELATION_INDEX_PAGE_SIZE = 500;

export const GetImportRelationIndexSchema = z.object({
  entityTypes: z.array(z.enum(EntityType)).max(Object.keys(EntityType).length),
  includeUsers: z.boolean().optional(),
});
export type GetImportRelationIndexData = Data<typeof GetImportRelationIndexSchema>;

export const DUPLICATE_STRATEGIES = ["create", "update", "skip"] as const;

export const DuplicateStrategySchema = z.enum(DUPLICATE_STRATEGIES);
export type DuplicateStrategy = Data<typeof DuplicateStrategySchema>;

export const IMPORT_KEY_MATCH_BATCH = 200;

export const IMPORT_KEY_VALUE_MAX_LENGTH = 400;

export const ImportKeyColumnSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), key: z.string().trim().min(1).max(100) }),
  z.object({ kind: z.literal("identifier"), provider: z.enum(MessagingProvider) }),
  z.object({ kind: z.literal("customField"), columnId: z.uuid() }),
]);
export type ImportKeyColumn = Data<typeof ImportKeyColumnSchema>;

export const MatchImportKeysSchema = z
  .object({
    entityType: z.enum(EntityType),
    key: ImportKeyColumnSchema,
    values: z.array(z.string().trim().min(1).max(IMPORT_KEY_VALUE_MAX_LENGTH)).min(1).max(IMPORT_KEY_MATCH_BATCH),
  })
  .superRefine((data, ctx) => {
    const supported =
      data.key.kind === "field"
        ? IMPORT_KEY_FIELDS[data.entityType].includes(data.key.key)
        : data.key.kind !== "identifier" || IMPORT_ENTITIES[data.entityType].supportsIdentifiers;

    if (!supported)
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.importKeyUnsupported }, path: ["key"] });
  });
export type MatchImportKeysData = Data<typeof MatchImportKeysSchema>;

export type ImportKeyMatch = [value: string, ids: string[]];

export type MatchImportKeysResult = { matches: ImportKeyMatch[] };

export const USER_RELATION_KEY = "user";

export type RelationIndexKey = EntityType | typeof USER_RELATION_KEY;

export type RelationIndexEntry = [label: string, id: string];

export type RelationIndexResult = {
  index: Partial<Record<RelationIndexKey, RelationIndexEntry[]>>;
  truncated: RelationIndexKey[];
};
