import type { Locale, RecordDocumentEnvelopeStatus, RecordDocumentStatus } from "@/generated/prisma";
import type { RecordDocumentEntityType } from "@/features/record-files/record-file.schema";
import type { SigningRecipientState } from "@/core/signing/signing-provider";
import type { RecordDocumentDto } from "../record-document.schema";
import type { SupersededRecordDocumentFile } from "../upload/complete-record-document-file.repo";

export type EnvelopeRecordDocument = {
  id: string;
  companyId: string;
  entityType: RecordDocumentEntityType;
  recordId: string;
  title: string;
  status: RecordDocumentStatus;
  envelopeId: string;
  envelopeStatus: RecordDocumentEnvelopeStatus | null;
  recipients: SigningRecipientState[];
  creator: { email: string; displayLanguage: Locale } | null;
};

export type SignableRecordDocument = {
  id: string;
  entityType: RecordDocumentEntityType;
  recordId: string;
  title: string;
  status: RecordDocumentStatus;
  envelopeId: string | null;
  envelopeStatus: RecordDocumentEnvelopeStatus | null;
  recipients: SigningRecipientState[];
  creator: { email: string; displayLanguage: Locale } | null;
  original: { storageKey: string; fileName: string };
};

export interface RecordDocumentSigningRepo {
  findDocumentByEnvelopeUnscoped(envelopeId: string): Promise<EnvelopeRecordDocument | null>;
  attachEnvelopeCopyUnscoped(args: {
    companyId: string;
    documentId: string;
    storageKey: string;
    fileName: string;
    byteSize: number;
  }): Promise<SupersededRecordDocumentFile[]>;
  recordEnvelopeStateUnscoped(args: {
    companyId: string;
    documentId: string;
    envelopeStatus: RecordDocumentEnvelopeStatus | null;
    status: RecordDocumentStatus;
    recipients: readonly SigningRecipientState[];
  }): Promise<{ completedNow: boolean }>;
}

export interface SignRecordDocumentRepo {
  findSignableDocumentOrNull(id: string): Promise<SignableRecordDocument | null>;
  recordEnvelopeSentOrNull(
    id: string,
    args: { envelopeId: string; recipients: readonly SigningRecipientState[]; sentAt: Date },
  ): Promise<RecordDocumentDto | null>;
  findListedDocumentOrNull(id: string): Promise<RecordDocumentDto | null>;
}

export interface GetSignatureSuggestionsRepo {
  isRecordAccessible(entityType: RecordDocumentEntityType, recordId: string): Promise<boolean>;
  suggestSignatureRecipients(
    entityType: RecordDocumentEntityType,
    recordId: string,
    limit: number,
  ): Promise<{ name: string; email: string }[]>;
}
