import type { LeadDto } from "@/features/leads/lead.schema";
import type { WebFormFieldMapping } from "../ingest/field-mapping";

export type PendingSubmission = {
  id: string;
  companyId: string;
  sourceId: string;
  rawPayload: unknown;
  sourceName: string;
  fieldMapping: WebFormFieldMapping;
  defaultOwnerId: string | null;
  defaultLabels: string[];
};

export type ResolveContactArgs = {
  companyId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type ResolveOrganizationArgs = {
  companyId: string;
  name: string | null;
};

export type CreateLeadFromSubmissionArgs = {
  companyId: string;
  sourceId: string;
  title: string;
  contactId: string | null;
  organizationId: string | null;
  ownerUserId: string | null;
  labels: string[];
  message: string | null;
};

export abstract class ProcessWebFormSubmissionRepo {
  abstract findPendingSubmissionUnscoped(submissionId: string): Promise<PendingSubmission | null>;
  abstract resolveContactUnscoped(args: ResolveContactArgs): Promise<string | null>;
  abstract resolveOrganizationUnscoped(args: ResolveOrganizationArgs): Promise<string | null>;
  abstract createLeadFromSubmissionUnscoped(args: CreateLeadFromSubmissionArgs): Promise<string>;
  abstract markSubmissionProcessedUnscoped(submissionId: string, leadId: string): Promise<void>;
  abstract markSubmissionFailedUnscoped(submissionId: string, error: string): Promise<void>;
  abstract findLeadForEventUnscoped(leadId: string): Promise<LeadDto>;
}
