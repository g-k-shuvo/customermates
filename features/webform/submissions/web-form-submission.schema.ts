import { z } from "zod";

export const WEB_FORM_SUBMISSION_STATUSES = ["received", "processed", "failed"] as const;
export type WebFormSubmissionStatus = (typeof WEB_FORM_SUBMISSION_STATUSES)[number];

export const WebFormSubmissionDtoSchema = z.object({
  id: z.uuid(),
  sourceId: z.uuid(),
  sourceName: z.string(),
  externalId: z.string().nullable(),
  status: z.enum(WEB_FORM_SUBMISSION_STATUSES),
  error: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  leadId: z.uuid().nullable(),
  leadTitle: z.string().nullable(),
  rawPayload: z.unknown(),
  receivedAt: z.date(),
  processedAt: z.date().nullable(),
});
export type WebFormSubmissionDto = z.infer<typeof WebFormSubmissionDtoSchema>;

export const RetryWebFormSubmissionSchema = z.object({ id: z.uuid() });
export type RetryWebFormSubmissionData = z.infer<typeof RetryWebFormSubmissionSchema>;
