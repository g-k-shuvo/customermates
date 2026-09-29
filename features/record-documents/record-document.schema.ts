import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import {
  RecordDocumentEnvelopeStatus,
  RecordDocumentFileKind,
  RecordDocumentSigningProvider,
  RecordDocumentStatus,
} from "@/generated/prisma";

import {
  PresignedUploadDtoSchema,
  RECORD_FILE_NAME_MAX_LENGTH,
  RecordDocumentEntityTypeSchema,
} from "@/features/record-files/record-file.schema";

export const RECORD_DOCUMENT_TITLE_MAX_LENGTH = 200;

export const RecordDocumentStatusSchema = z.enum(RecordDocumentStatus);

export const RecordDocumentFileKindSchema = z.enum(RecordDocumentFileKind);

const UserReferenceSchema = z.object({ id: z.uuid(), firstName: z.string(), lastName: z.string() });

export const RecordDocumentFileDtoSchema = z.object({
  id: z.uuid(),
  kind: RecordDocumentFileKindSchema,
  fileName: z.string(),
  byteSize: z.number().int().nonnegative(),
  uploadedBy: UserReferenceSchema.nullable(),
  createdAt: z.date(),
});

export type RecordDocumentFileDto = Data<typeof RecordDocumentFileDtoSchema>;

export const RecordDocumentSignatureDtoSchema = z.object({
  provider: z.enum(RecordDocumentSigningProvider),
  status: z.enum(RecordDocumentEnvelopeStatus),
  sentAt: z.date(),
  recipients: z.array(
    z.object({ name: z.string(), email: z.string(), status: z.string(), completedAt: z.date().nullable() }),
  ),
});

export type RecordDocumentSignatureDto = Data<typeof RecordDocumentSignatureDtoSchema>;

export const RecordDocumentDtoSchema = z.object({
  id: z.uuid(),
  entityType: RecordDocumentEntityTypeSchema,
  recordId: z.uuid(),
  title: z.string(),
  status: RecordDocumentStatusSchema,
  statusChangedAt: z.date(),
  original: RecordDocumentFileDtoSchema.nullable(),
  signed: RecordDocumentFileDtoSchema.nullable(),
  signature: RecordDocumentSignatureDtoSchema.nullable(),
  createdBy: UserReferenceSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RecordDocumentDto = Data<typeof RecordDocumentDtoSchema>;

export const RecordDocumentListDtoSchema = z.object({
  storageConfigured: z.boolean(),
  signingConfigured: z.boolean(),
  maxUploadBytes: z.number().int().nonnegative(),
  documents: z.array(RecordDocumentDtoSchema),
});

export type RecordDocumentListDto = Data<typeof RecordDocumentListDtoSchema>;

export const RecordDocumentUploadDtoSchema = z.object({
  document: RecordDocumentDtoSchema,
  file: RecordDocumentFileDtoSchema,
  upload: PresignedUploadDtoSchema,
});

export type RecordDocumentUploadDto = Data<typeof RecordDocumentUploadDtoSchema>;

export const RecordDocumentPdfSchema = z.object({
  fileName: z.string().trim().min(1).max(RECORD_FILE_NAME_MAX_LENGTH),
  contentType: z.string().max(255),
  byteSize: z.number().int().positive(),
});

export const RecordDocumentIdSchema = z.object({ id: z.uuid() });

export type RecordDocumentIdData = Data<typeof RecordDocumentIdSchema>;

export const RecordDocumentFileIdSchema = z.object({ id: z.uuid(), fileId: z.uuid() });

export type RecordDocumentFileIdData = Data<typeof RecordDocumentFileIdSchema>;

export const DeleteRecordDocumentResultSchema = z.object({ id: z.uuid() });

export type DeleteRecordDocumentResult = Data<typeof DeleteRecordDocumentResultSchema>;

export const SweepRecordDocumentsResultSchema = z.object({
  removedFiles: z.number().int().nonnegative(),
  removedDocuments: z.number().int().nonnegative(),
});

export type SweepRecordDocumentsResult = Data<typeof SweepRecordDocumentsResultSchema>;
