import type { ProcessWebFormSubmissionRepo } from "./process-web-form-submission.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { mapWebFormFields, readDotPath, renderTitle } from "../ingest/field-mapping";

export const ProcessWebFormSubmissionSchema = z.object({
  submissionId: z.uuid(),
});
export type ProcessWebFormSubmissionData = Data<typeof ProcessWebFormSubmissionSchema>;

export const ProcessWebFormSubmissionOutcomeSchema = z.object({
  leadId: z.string().nullable(),
  skipped: z.boolean(),
  companyId: z.string().nullable(),
  publisherUserId: z.string().nullable(),
});
export type ProcessWebFormSubmissionOutcome = Data<typeof ProcessWebFormSubmissionOutcomeSchema>;

@SystemInteractor
export class ProcessWebFormSubmissionInteractor {
  constructor(private repo: ProcessWebFormSubmissionRepo) {}

  @Validate(ProcessWebFormSubmissionSchema)
  @ValidateOutput(ProcessWebFormSubmissionOutcomeSchema)
  async invoke(data: ProcessWebFormSubmissionData): Validated<ProcessWebFormSubmissionOutcome> {
    const submission = await this.repo.findPendingSubmissionUnscoped(data.submissionId);
    if (!submission)
      return { ok: true as const, data: { leadId: null, skipped: true, companyId: null, publisherUserId: null } };

    try {
      const fields = mapWebFormFields(submission.rawPayload, submission.fieldMapping);

      const contactId = await this.repo.resolveContactUnscoped({
        companyId: submission.companyId,
        email: fields.email,
        firstName: fields.firstName,
        lastName: fields.lastName,
      });

      const organizationId = await this.repo.resolveOrganizationUnscoped({
        companyId: submission.companyId,
        name: fields.organizationName,
      });

      const title = renderTitle(submission.fieldMapping.titleTemplate, fields, {
        formTitle: readDotPath(submission.rawPayload, "form_title"),
        sourceName: submission.sourceName,
      });

      const leadId = await this.repo.createLeadFromSubmissionUnscoped({
        companyId: submission.companyId,
        sourceId: submission.sourceId,
        title,
        contactId,
        organizationId,
        ownerUserId: submission.defaultOwnerId,
        labels: submission.defaultLabels,
        message: fields.message,
      });

      await this.repo.markSubmissionProcessedUnscoped(submission.id, leadId);

      const publisherUserId =
        submission.defaultOwnerId ?? (await this.repo.findTaskCapableUserIdUnscoped(submission.companyId));

      return {
        ok: true as const,
        data: { leadId, skipped: false, companyId: submission.companyId, publisherUserId },
      };
    } catch (error) {
      await this.repo.markSubmissionFailedUnscoped(
        submission.id,
        error instanceof Error ? error.message : String(error),
      );

      throw error;
    }
  }
}
