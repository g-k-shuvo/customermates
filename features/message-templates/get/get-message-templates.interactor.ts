import type { Validated } from "@/core/validation/validation.utils";
import type { MessageTemplateRepo } from "../message-template.repo";

import {
  type MessageTemplateDto,
  MessageTemplateDtoSchema,
  type MessageTemplateIdData,
  MessageTemplateIdSchema,
  TEMPLATE_READ,
} from "../message-template.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

@AllowInDemoMode
@TenantInteractor(TEMPLATE_READ)
export class GetMessageTemplatesInteractor extends AuthenticatedInteractor<void, MessageTemplateDto[]> {
  constructor(private repo: MessageTemplateRepo) {
    super();
  }

  @ValidateOutput(MessageTemplateDtoSchema)
  async invoke(): Validated<MessageTemplateDto[]> {
    return { ok: true as const, data: await this.repo.listTemplates() };
  }
}

@AllowInDemoMode
@TenantInteractor(TEMPLATE_READ)
export class GetMessageTemplateInteractor extends AuthenticatedInteractor<MessageTemplateIdData, MessageTemplateDto> {
  constructor(private repo: MessageTemplateRepo) {
    super();
  }

  @Validate(MessageTemplateIdSchema)
  @ValidateOutput(MessageTemplateDtoSchema)
  async invoke({ id }: MessageTemplateIdData): Validated<MessageTemplateDto> {
    const template = await this.repo.findTemplateOrNull(id);
    if (!template) return failNotFound(CustomErrorCode.messageTemplateNotFound, ["id"]);

    return { ok: true as const, data: template };
  }
}
