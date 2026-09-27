import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Validated } from "@/core/validation/validation.utils";
import type { ValidateWebFormSubmissionIdsInteractor } from "@/core/validation/validators/validate-web-form-submission-ids.interactor";
import type { RetryWebFormSubmissionData, WebFormSubmissionDto } from "./web-form-submission.schema";

import { Resource, Action } from "@/generated/prisma";

import { RetryWebFormSubmissionSchema, WebFormSubmissionDtoSchema } from "./web-form-submission.schema";

import { Write } from "@/core/decorators/write.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failConflict } from "@/core/validation/interactor-failure-server";

export abstract class RetryWebFormSubmissionRepo {
  abstract getSubmissionByIdOrThrow(id: string): Promise<WebFormSubmissionDto>;
  abstract requeueFailedSubmission(id: string): Promise<boolean>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.leads, action: Action.readAll },
    { resource: Resource.leads, action: Action.create },
  ],
  condition: "AND",
})
export class RetryWebFormSubmissionInteractor extends AuthenticatedInteractor<
  RetryWebFormSubmissionData,
  WebFormSubmissionDto
> {
  constructor(
    private repo: RetryWebFormSubmissionRepo,
    private backgroundTasks: BackgroundTaskService,
    private validator: ValidateWebFormSubmissionIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: RetryWebFormSubmissionSchema,
    output: WebFormSubmissionDtoSchema,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: RetryWebFormSubmissionData): Validated<WebFormSubmissionDto> {
    const requeued = await this.repo.requeueFailedSubmission(data.id);
    if (!requeued) return failConflict(CustomErrorCode.webFormSubmissionNotRetryable, ["id"]);

    await this.backgroundTasks.dispatch("process-web-form-submission", { submissionId: data.id });

    return { ok: true as const, data: await this.repo.getSubmissionByIdOrThrow(data.id) };
  }
}
