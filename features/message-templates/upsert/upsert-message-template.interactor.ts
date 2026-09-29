import type { Validated } from "@/core/validation/validation.utils";
import type { MessageTemplateRepo } from "../message-template.repo";

import { z } from "zod";

import {
  type CreateMessageTemplateData,
  CreateMessageTemplateSchema,
  type MessageTemplateDto,
  MessageTemplateDtoSchema,
  type MessageTemplateIdData,
  MessageTemplateIdSchema,
  TEMPLATE_WRITE,
  type UpdateMessageTemplateData,
  UpdateMessageTemplateSchema,
} from "../message-template.schema";
import { failMerge } from "../merge-failure";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { parseMergePlaceholders } from "@/features/messaging-send/render/merge-fields";

function checkPlaceholders(fields: { subject?: string; bodyMarkdown?: string }) {
  for (const [path, text] of [
    ["subject", fields.subject],
    ["bodyMarkdown", fields.bodyMarkdown],
  ] as const) {
    if (text === undefined) continue;

    const parsed = parseMergePlaceholders(text);
    if (!parsed.ok) return failMerge(parsed.failure, path);
  }

  return null;
}

@TenantInteractor(TEMPLATE_WRITE)
export class CreateMessageTemplateInteractor extends AuthenticatedInteractor<
  CreateMessageTemplateData,
  MessageTemplateDto
> {
  constructor(private repo: MessageTemplateRepo) {
    super();
  }

  @Write({ input: CreateMessageTemplateSchema, output: MessageTemplateDtoSchema })
  async invoke(data: CreateMessageTemplateData): Validated<MessageTemplateDto> {
    const invalid = checkPlaceholders(data);
    if (invalid) return invalid;
    if (await this.repo.isNameTaken(data.name, null))
      return failConflict(CustomErrorCode.messageTemplateNameTaken, ["name"]);

    return { ok: true as const, data: await this.repo.createTemplate(data) };
  }
}

@TenantInteractor(TEMPLATE_WRITE)
export class UpdateMessageTemplateInteractor extends AuthenticatedInteractor<
  UpdateMessageTemplateData,
  MessageTemplateDto
> {
  constructor(private repo: MessageTemplateRepo) {
    super();
  }

  @Write({ input: UpdateMessageTemplateSchema, output: MessageTemplateDtoSchema })
  async invoke({ id, ...fields }: UpdateMessageTemplateData): Validated<MessageTemplateDto> {
    if (!(await this.repo.findTemplateOrNull(id))) return failNotFound(CustomErrorCode.messageTemplateNotFound, ["id"]);

    const invalid = checkPlaceholders(fields);
    if (invalid) return invalid;
    if (fields.name && (await this.repo.isNameTaken(fields.name, id)))
      return failConflict(CustomErrorCode.messageTemplateNameTaken, ["name"]);

    const updated = await this.repo.updateTemplate(id, fields);
    if (!updated) return failNotFound(CustomErrorCode.messageTemplateNotFound, ["id"]);

    return { ok: true as const, data: updated };
  }
}

@TenantInteractor(TEMPLATE_WRITE)
export class DeleteMessageTemplateInteractor extends AuthenticatedInteractor<MessageTemplateIdData, { id: string }> {
  constructor(private repo: MessageTemplateRepo) {
    super();
  }

  @Write({ input: MessageTemplateIdSchema, output: z.object({ id: z.uuid() }) })
  async invoke({ id }: MessageTemplateIdData): Validated<{ id: string }> {
    if (!(await this.repo.deleteTemplate(id))) return failNotFound(CustomErrorCode.messageTemplateNotFound, ["id"]);

    return { ok: true as const, data: { id } };
  }
}
