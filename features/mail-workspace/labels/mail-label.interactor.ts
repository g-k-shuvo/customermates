import type { Validated } from "@/core/validation/validation.utils";
import type { MailLabelRepo } from "../mail-workspace.repo";
import type { MailThreadLabelDto } from "@/features/mailbox/mailbox.schema";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";
import { MailThreadLabelDtoSchema } from "@/features/mailbox/mailbox.schema";

import {
  MailLabelIdSchema,
  SetThreadLabelsSchema,
  UpsertMailLabelSchema,
  type MailLabelIdData,
  type SetThreadLabelsData,
  type UpsertMailLabelData,
} from "../mail-workspace.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

const DeletedLabelSchema = z.object({ id: z.uuid() });

const ThreadLabelsSchema = z.object({ threadId: z.uuid(), labels: z.array(MailThreadLabelDtoSchema) });

export type ThreadLabels = z.infer<typeof ThreadLabelsSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailLabelsInteractor extends AuthenticatedInteractor<void, MailThreadLabelDto[]> {
  constructor(private repo: MailLabelRepo) {
    super();
  }

  @ValidateOutput(MailThreadLabelDtoSchema)
  async invoke(): Validated<MailThreadLabelDto[]> {
    return { ok: true as const, data: await this.repo.listLabels() };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class UpsertMailLabelInteractor extends AuthenticatedInteractor<UpsertMailLabelData, MailThreadLabelDto> {
  constructor(private repo: MailLabelRepo) {
    super();
  }

  @Write({ input: UpsertMailLabelSchema, output: MailThreadLabelDtoSchema })
  async invoke(data: UpsertMailLabelData): Validated<MailThreadLabelDto> {
    const sameName = await this.repo.findLabelByName(data.name);
    if (sameName && sameName.id !== data.id) return failConflict(CustomErrorCode.mailLabelNameTaken, ["name"]);

    if (!data.id) return { ok: true as const, data: await this.repo.createLabel(data) };

    const updated = await this.repo.updateLabel(data.id, data);
    if (!updated) return failNotFound(CustomErrorCode.mailLabelNotFound, ["id"]);

    return { ok: true as const, data: updated };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class DeleteMailLabelInteractor extends AuthenticatedInteractor<MailLabelIdData, { id: string }> {
  constructor(private repo: MailLabelRepo) {
    super();
  }

  @Write({ input: MailLabelIdSchema, output: DeletedLabelSchema })
  async invoke(data: MailLabelIdData): Validated<{ id: string }> {
    if (!(await this.repo.deleteLabel(data.id))) return failNotFound(CustomErrorCode.mailLabelNotFound, ["id"]);

    return { ok: true as const, data: { id: data.id } };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SetThreadLabelsInteractor extends AuthenticatedInteractor<SetThreadLabelsData, ThreadLabels> {
  constructor(private repo: MailLabelRepo) {
    super();
  }

  @Write({ input: SetThreadLabelsSchema, output: ThreadLabelsSchema })
  async invoke(data: SetThreadLabelsData): Validated<ThreadLabels> {
    if (!(await this.repo.threadIsReadable(data.threadId)))
      return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    const labelIds = [...new Set(data.labelIds)];
    if ((await this.repo.countLabels(labelIds)) !== labelIds.length)
      return await fail(CustomErrorCode.mailLabelNotFound, ["labelIds"]);

    return {
      ok: true as const,
      data: { threadId: data.threadId, labels: await this.repo.setThreadLabels(data.threadId, labelIds) },
    };
  }
}
