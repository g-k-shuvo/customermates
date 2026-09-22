import type { IngestWebFormSubmissionRepo } from "./ingest-web-form-submission.repo";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { verifyWebFormSignature } from "./webform-signature";

export const WEBFORM_RATE_LIMIT_WINDOW_MS = 60_000;
export const WEBFORM_RATE_LIMIT_MAX = 60;

export const IngestWebFormSubmissionSchema = z.object({
  slug: z.string().trim().min(1).max(128),
  rawBody: z.string().max(1_000_000),
  signatureHeader: z.string().nullable(),
});
export type IngestWebFormSubmissionData = Data<typeof IngestWebFormSubmissionSchema>;

export const IngestWebFormSubmissionOutcomeSchema = z.object({
  outcome: z.enum(["accepted", "duplicate", "unknown-source", "invalid-signature", "rate-limited", "invalid-body"]),
  submissionId: z.string().nullable(),
});
export type IngestWebFormSubmissionOutcome = Data<typeof IngestWebFormSubmissionOutcomeSchema>;

function readExternalId(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>).external_id;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);

  return null;
}

@SystemInteractor
export class IngestWebFormSubmissionInteractor {
  constructor(
    private repo: IngestWebFormSubmissionRepo,
    private backgroundTasks: BackgroundTaskService,
  ) {}

  @Validate(IngestWebFormSubmissionSchema)
  @ValidateOutput(IngestWebFormSubmissionOutcomeSchema)
  async invoke(data: IngestWebFormSubmissionData): Validated<IngestWebFormSubmissionOutcome> {
    const source = await this.repo.findActiveSourceBySlugUnscoped(data.slug);
    if (!source) return { ok: true as const, data: { outcome: "unknown-source", submissionId: null } };

    const allowed = await this.repo.consumeRateLimitUnscoped({
      sourceId: source.id,
      companyId: source.companyId,
      windowMs: WEBFORM_RATE_LIMIT_WINDOW_MS,
      max: WEBFORM_RATE_LIMIT_MAX,
    });
    if (!allowed) return { ok: true as const, data: { outcome: "rate-limited", submissionId: null } };

    if (!verifyWebFormSignature(data.rawBody, data.signatureHeader, source.signingSecret))
      return { ok: true as const, data: { outcome: "invalid-signature", submissionId: null } };

    let body: unknown;
    try {
      body = JSON.parse(data.rawBody);
    } catch {
      return { ok: true as const, data: { outcome: "invalid-body", submissionId: null } };
    }

    const stored = await this.repo.storeSubmissionUnscoped({
      companyId: source.companyId,
      sourceId: source.id,
      externalId: readExternalId(body),
      rawPayload: body,
    });

    if (!stored.created) return { ok: true as const, data: { outcome: "duplicate", submissionId: stored.id } };

    await this.backgroundTasks.dispatch("process-web-form-submission", { submissionId: stored.id });

    return { ok: true as const, data: { outcome: "accepted", submissionId: stored.id } };
  }
}
