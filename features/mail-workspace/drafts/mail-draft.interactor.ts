import type { Validated } from "@/core/validation/validation.utils";
import type { MailDraftRepo } from "../mail-workspace.repo";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import {
  MailComposeSchema,
  MailDraftDtoSchema,
  ThreadIdSchema,
  type MailComposeData,
  type ThreadIdData,
} from "../mail-workspace.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

const DraftOrNoneSchema = z.object({ draft: MailDraftDtoSchema.nullable() });

export type DraftOrNone = z.infer<typeof DraftOrNoneSchema>;

export function isEmptyCompose(data: Pick<MailComposeData, "body" | "recipients">): boolean {
  return data.body.trim().length === 0 && data.recipients.length === 0;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetMailDraftInteractor extends AuthenticatedInteractor<ThreadIdData, DraftOrNone> {
  constructor(private repo: MailDraftRepo) {
    super();
  }

  @Validate(ThreadIdSchema)
  @ValidateOutput(DraftOrNoneSchema)
  async invoke(data: ThreadIdData): Validated<DraftOrNone> {
    return { ok: true as const, data: { draft: await this.repo.getDraft(data.threadId) } };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SaveMailDraftInteractor extends AuthenticatedInteractor<MailComposeData, DraftOrNone> {
  constructor(private repo: MailDraftRepo) {
    super();
  }

  @Write({ input: MailComposeSchema, output: DraftOrNoneSchema })
  async invoke(data: MailComposeData): Validated<DraftOrNone> {
    if (!(await this.repo.findOwnThread(data.threadId)))
      return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    if (isEmptyCompose(data)) {
      await this.repo.deleteDraft(data.threadId);
      return { ok: true as const, data: { draft: null } };
    }

    return { ok: true as const, data: { draft: await this.repo.saveDraft(data) } };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class DeleteMailDraftInteractor extends AuthenticatedInteractor<ThreadIdData, DraftOrNone> {
  constructor(private repo: MailDraftRepo) {
    super();
  }

  @Write({ input: ThreadIdSchema, output: DraftOrNoneSchema })
  async invoke(data: ThreadIdData): Validated<DraftOrNone> {
    await this.repo.deleteDraft(data.threadId);

    return { ok: true as const, data: { draft: null } };
  }
}
