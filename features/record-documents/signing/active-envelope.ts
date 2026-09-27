import { RecordDocumentEnvelopeStatus } from "@/generated/prisma";

const ACTIVE: ReadonlySet<RecordDocumentEnvelopeStatus> = new Set([
  RecordDocumentEnvelopeStatus.sent,
  RecordDocumentEnvelopeStatus.delivered,
]);

export function isEnvelopeActive(status: RecordDocumentEnvelopeStatus | null | undefined): boolean {
  return status !== null && status !== undefined && ACTIVE.has(status);
}
