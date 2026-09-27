import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const RECORD_FILE_ENTITY_TYPES = ["contact", "organization", "deal"] as const;

export const RecordFileEntityTypeSchema = z.enum(RECORD_FILE_ENTITY_TYPES);

export type RecordFileEntityType = z.infer<typeof RecordFileEntityTypeSchema>;

export const RECORD_FILE_NAME_MAX_LENGTH = 255;

export const RecordFileDtoSchema = z.object({
  id: z.uuid(),
  entityType: RecordFileEntityTypeSchema,
  recordId: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  uploadedBy: z.object({ id: z.uuid(), firstName: z.string(), lastName: z.string() }).nullable(),
  createdAt: z.date(),
});

export type RecordFileDto = Data<typeof RecordFileDtoSchema>;

export const RecordFileListDtoSchema = z.object({
  storageConfigured: z.boolean(),
  maxUploadBytes: z.number().int().nonnegative(),
  files: z.array(RecordFileDtoSchema),
});

export type RecordFileListDto = Data<typeof RecordFileListDtoSchema>;

export const PresignedUploadDtoSchema = z.object({
  url: z.url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.date(),
});

export const RecordFileUploadDtoSchema = z.object({
  file: RecordFileDtoSchema,
  upload: PresignedUploadDtoSchema,
});

export type RecordFileUploadDto = Data<typeof RecordFileUploadDtoSchema>;

export const RecordFileDownloadDtoSchema = z.object({
  url: z.url(),
  expiresAt: z.date(),
});

export type RecordFileDownloadDto = Data<typeof RecordFileDownloadDtoSchema>;

export const RecordFileIdSchema = z.object({ id: z.uuid() });

export type RecordFileIdData = Data<typeof RecordFileIdSchema>;

export const RecordFileTargetSchema = z.object({
  entityType: RecordFileEntityTypeSchema,
  recordId: z.uuid(),
});

export type RecordFileTargetData = Data<typeof RecordFileTargetSchema>;

export const DeleteRecordFileResultSchema = z.object({ id: z.uuid() });

export type DeleteRecordFileResult = Data<typeof DeleteRecordFileResultSchema>;

export const SweepRecordFilesResultSchema = z.object({ removed: z.number().int().nonnegative() });

export type SweepRecordFilesResult = Data<typeof SweepRecordFilesResultSchema>;
