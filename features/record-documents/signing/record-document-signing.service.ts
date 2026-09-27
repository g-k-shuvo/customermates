import type { SigningEnvelopeState, SigningProvider } from "@/core/signing/signing-provider";
import type { StorageProvider } from "@/core/storage/storage-provider";
import type { DocumentSignedNotifier } from "./document-signed.notifier";
import type { EnvelopeRecordDocument, RecordDocumentSigningRepo } from "./record-document-signing.repo";

import * as Sentry from "@sentry/nextjs";
import { RecordDocumentEnvelopeStatus, RecordDocumentStatus } from "@/generated/prisma";

import { mintStorageKey } from "@/core/storage/storage-key";

const DOCUMENT_STATUS_FOR: Record<RecordDocumentEnvelopeStatus, RecordDocumentStatus> = {
  sent: RecordDocumentStatus.sent,
  delivered: RecordDocumentStatus.sent,
  completed: RecordDocumentStatus.completed,
  declined: RecordDocumentStatus.declined,
  voided: RecordDocumentStatus.voided,
};

export function signedCopyFileName(title: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || "document";
  return `${base} (signed).pdf`;
}

export class RecordDocumentSigningService {
  constructor(
    private repo: RecordDocumentSigningRepo,
    private signing: SigningProvider,
    private storage: StorageProvider,
    private notifier: DocumentSignedNotifier,
  ) {}

  async apply(document: EnvelopeRecordDocument, state: SigningEnvelopeState): Promise<void> {
    const envelopeStatus = state.status ?? document.envelopeStatus;
    const becomesCompleted =
      envelopeStatus === RecordDocumentEnvelopeStatus.completed &&
      document.envelopeStatus !== RecordDocumentEnvelopeStatus.completed;

    if (becomesCompleted) await this.storeCompletedCopy(document);

    const { completedNow } = await this.repo.recordEnvelopeStateUnscoped({
      companyId: document.companyId,
      documentId: document.id,
      envelopeStatus,
      status: envelopeStatus ? DOCUMENT_STATUS_FOR[envelopeStatus] : document.status,
      recipients: state.recipients.length > 0 ? state.recipients : document.recipients,
    });

    if (!completedNow) return;

    try {
      await this.notifier.notify(document, state.recipients.length > 0 ? state.recipients : document.recipients);
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "document-signed-notice-failure" } });
    }
  }

  private async storeCompletedCopy(document: EnvelopeRecordDocument): Promise<void> {
    const pdf = await this.signing.downloadCompletedPdf(document.envelopeId);
    const storageKey = mintStorageKey({
      companyId: document.companyId,
      scope: "document",
      recordId: document.recordId,
      extension: "pdf",
    });

    await this.storage.putObject({ key: storageKey, body: pdf, contentType: "application/pdf" });
    const superseded = await this.repo.attachEnvelopeCopyUnscoped({
      companyId: document.companyId,
      documentId: document.id,
      storageKey,
      fileName: signedCopyFileName(document.title),
      byteSize: pdf.byteLength,
    });

    await Promise.all(superseded.map((file) => this.storage.deleteObject(file.storageKey).catch(() => undefined)));
  }
}
