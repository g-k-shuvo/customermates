import type { Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { ContactMergeRepo } from "./contact-merge.repo";

import { Action, Resource } from "@/generated/prisma";

import {
  type ContactMergeIdData,
  ContactMergeIdSchema,
  type ContactMergeRecordDto,
  ContactMergeRecordDtoSchema,
  MERGE_UNDO_DAYS,
  type MergeContactsData,
  type MergeContactsResult,
  MergeContactsResultSchema,
  MergeContactsSchema,
} from "../duplicate.schema";
import { mergeSourcesAreMembers, planWinnerUpdate } from "./merge-plan";

import { DomainEvent } from "@/features/event/domain-events";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";

export const RECENT_MERGES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const MERGE_PERMISSIONS = {
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.update },
    { resource: Resource.contacts, action: Action.delete },
  ],
  condition: "AND" as const,
};

export abstract class MergeContactReadRepo {
  abstract getContactById(id: string): Promise<ContactDto | null>;
}

@TenantInteractor(MERGE_PERMISSIONS)
export class MergeContactsInteractor extends AuthenticatedInteractor<MergeContactsData, MergeContactsResult> {
  constructor(
    private repo: ContactMergeRepo,
    private contacts: MergeContactReadRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: MergeContactsSchema, output: MergeContactsResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: MergeContactsData): Validated<MergeContactsResult> {
    const loserIds = [...new Set(data.loserIds)];
    if (loserIds.includes(data.winnerId)) return fail(CustomErrorCode.contactMergeWinnerIsLoser, ["loserIds"]);

    const members = await this.repo.loadMembersOrNull([data.winnerId, ...loserIds]);
    if (!members) return failNotFound(CustomErrorCode.contactNotFound, ["loserIds"]);

    const picks = data.fields ?? {};
    if (!mergeSourcesAreMembers(members, picks)) return fail(CustomErrorCode.contactMergePickNotMember, ["fields"]);

    const [winner, ...losers] = members;
    const before = await this.contacts.getContactById(winner.id);
    const loserDtos = await Promise.all(losers.map((loser) => this.contacts.getContactById(loser.id)));

    const mergeId = await this.repo.mergeContacts({
      winner,
      losers,
      update: planWinnerUpdate(winner, losers, picks),
      groupId: data.groupId,
    });

    const after = await this.contacts.getContactById(winner.id);
    if (before && after) {
      await this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: winner.id,
        payload: { contact: after, changes: calculateChanges(before, after) },
      });
    }
    for (const loser of loserDtos)
      if (loser) await this.eventService.publish(DomainEvent.CONTACT_DELETED, { entityId: loser.id, payload: loser });

    return { ok: true as const, data: { mergeId, winnerId: winner.id } };
  }
}

@TenantInteractor(MERGE_PERMISSIONS)
export class UndoContactMergeInteractor extends AuthenticatedInteractor<ContactMergeIdData, MergeContactsResult> {
  constructor(
    private repo: ContactMergeRepo,
    private contacts: MergeContactReadRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: ContactMergeIdSchema, output: MergeContactsResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: ContactMergeIdData): Validated<MergeContactsResult> {
    const merge = await this.repo.findMergeOrNull(data.id);
    if (!merge) return failNotFound(CustomErrorCode.contactMergeNotFound, ["id"]);

    const expired = Date.now() - merge.createdAt.getTime() > MERGE_UNDO_DAYS * DAY_MS;
    const winnerId = merge.winnerId;
    if (merge.undoneAt || expired || !winnerId) return failConflict(CustomErrorCode.contactMergeNotUndoable, ["id"]);

    const taken = await this.repo.contactIdsThatExist(merge.loserIds);
    if (taken.size > 0) return failConflict(CustomErrorCode.contactMergeNotUndoable, ["id"]);

    const before = await this.contacts.getContactById(winnerId);
    await this.repo.undoMerge(merge);
    const after = await this.contacts.getContactById(winnerId);

    if (before && after) {
      await this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: winnerId,
        payload: { contact: after, changes: calculateChanges(before, after) },
      });
    }
    for (const loserId of merge.loserIds) {
      const restored = await this.contacts.getContactById(loserId);
      if (restored)
        await this.eventService.publish(DomainEvent.CONTACT_CREATED, { entityId: loserId, payload: restored });
    }

    return { ok: true as const, data: { mergeId: merge.id, winnerId } };
  }
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.contacts, action: Action.readAll })
export class GetContactMergesInteractor extends AuthenticatedInteractor<void, ContactMergeRecordDto[]> {
  constructor(private repo: ContactMergeRepo) {
    super();
  }

  @ValidateOutput(ContactMergeRecordDtoSchema)
  async invoke(): Validated<ContactMergeRecordDto[]> {
    return { ok: true as const, data: await this.repo.listRecentMerges(RECENT_MERGES) };
  }
}
