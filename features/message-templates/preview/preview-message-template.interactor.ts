import type { Validated } from "@/core/validation/validation.utils";
import type { MergeValuesRepo } from "@/features/messaging-send/render/merge-values.repo";

import {
  type MessageTemplatePreviewDto,
  MessageTemplatePreviewDtoSchema,
  type PreviewMessageTemplateData,
  PreviewMessageTemplateSchema,
  TEMPLATE_READ,
} from "../message-template.schema";
import { failMerge } from "../merge-failure";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { mergeValuesFrom } from "@/features/messaging-send/render/merge-fields";
import { emailBannerHtml, renderEmailMarkdown } from "@/features/messaging-send/render/render-email-markdown";

@AllowInDemoMode
@TenantInteractor(TEMPLATE_READ)
export class PreviewMessageTemplateInteractor extends AuthenticatedInteractor<
  PreviewMessageTemplateData,
  MessageTemplatePreviewDto
> {
  constructor(private values: MergeValuesRepo) {
    super();
  }

  @Validate(PreviewMessageTemplateSchema)
  @ValidateOutput(MessageTemplatePreviewDtoSchema)
  async invoke(data: PreviewMessageTemplateData): Validated<MessageTemplatePreviewDto> {
    const source = await this.values.loadMergeSource(data.record ?? null, this.userId);
    const rendered = renderEmailMarkdown({
      subject: data.subject,
      markdown: data.bodyMarkdown,
      values: mergeValuesFrom(source),
    });
    if (!rendered.ok && !data.record && rendered.failure.code === "missingMergeValue")
      return fail(CustomErrorCode.mergePreviewNeedsRecord, ["record"], { field: rendered.failure.field });
    if (!rendered.ok) return failMerge(rendered.failure, "bodyMarkdown");

    const banner = data.bannerUrl ? emailBannerHtml(data.bannerUrl) : "";

    return { ok: true as const, data: { ...rendered.email, html: `${banner}${rendered.email.html}` } };
  }
}
