import type { Validated } from "@/core/validation/validation.utils";
import type { MailThreadStateRepo } from "../mail-workspace.repo";

import { Resource, Action } from "@/generated/prisma";

import {
  SetThreadArchivedSchema,
  SetThreadFollowUpSchema,
  ThreadStateDtoSchema,
  type SetThreadArchivedData,
  type SetThreadFollowUpData,
  type ThreadStateDto,
} from "../mail-workspace.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SetThreadArchivedInteractor extends AuthenticatedInteractor<SetThreadArchivedData, ThreadStateDto> {
  constructor(
    private repo: MailThreadStateRepo,
    private now: () => Date,
  ) {
    super();
  }

  @Write({ input: SetThreadArchivedSchema, output: ThreadStateDtoSchema })
  async invoke(data: SetThreadArchivedData): Validated<ThreadStateDto> {
    const state = await this.repo.setArchived(data.threadId, data.archived, this.now());
    if (!state) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    return { ok: true as const, data: state };
  }
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SetThreadFollowUpInteractor extends AuthenticatedInteractor<SetThreadFollowUpData, ThreadStateDto> {
  constructor(private repo: MailThreadStateRepo) {
    super();
  }

  @Write({ input: SetThreadFollowUpSchema, output: ThreadStateDtoSchema })
  async invoke(data: SetThreadFollowUpData): Validated<ThreadStateDto> {
    const state = await this.repo.setFollowUp(data.threadId, data.followUpAt);
    if (!state) return failNotFound(CustomErrorCode.mailboxThreadNotFound, ["threadId"]);

    return { ok: true as const, data: state };
  }
}
