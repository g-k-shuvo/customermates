import type { Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { OrganizationMergeRepo } from "./organization-merge.repo";

import { Action, Resource } from "@/generated/prisma";

import {
  type ContactMergeIdData,
  ContactMergeIdSchema,
  type ContactMergeRecordDto,
  ContactMergeRecordDtoSchema,
  MERGE_UNDO_DAYS,
  type MergeContactsResult,
  MergeContactsResultSchema,
  type MergeOrganizationsData,
  MergeOrganizationsSchema,
} from "../duplicate.schema";
import { organizationSourcesAreMembers, planOrganizationUpdate } from "./merge-plan";
import { RECENT_MERGES } from "./merge-contacts.interactor";

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

const DAY_MS = 24 * 60 * 60 * 1000;

const MERGE_PERMISSIONS = {
  permissions: [
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.update },
    { resource: Resource.organizations, action: Action.delete },
  ],
  condition: "AND" as const,
};

export abstract class MergeOrganizationReadRepo {
  abstract getOrganizationById(id: string): Promise<OrganizationDto | null>;
}

@TenantInteractor(MERGE_PERMISSIONS)
export class MergeOrganizationsInteractor extends AuthenticatedInteractor<MergeOrganizationsData, MergeContactsResult> {
  constructor(
    private repo: OrganizationMergeRepo,
    private organizations: MergeOrganizationReadRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: MergeOrganizationsSchema, output: MergeContactsResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: MergeOrganizationsData): Validated<MergeContactsResult> {
    const loserIds = [...new Set(data.loserIds)];
    if (loserIds.includes(data.winnerId)) return fail(CustomErrorCode.contactMergeWinnerIsLoser, ["loserIds"]);

    const members = await this.repo.loadOrganizationsOrNull([data.winnerId, ...loserIds]);
    if (!members) return failNotFound(CustomErrorCode.organizationNotFound, ["loserIds"]);

    const picks = data.fields ?? {};
    if (!organizationSourcesAreMembers(members, picks))
      return fail(CustomErrorCode.contactMergePickNotMember, ["fields"]);

    const [winner, ...losers] = members;
    const before = await this.organizations.getOrganizationById(winner.id);
    const loserDtos = await Promise.all(losers.map((loser) => this.organizations.getOrganizationById(loser.id)));

    const mergeId = await this.repo.mergeOrganizations({
      winner,
      losers,
      update: planOrganizationUpdate(winner, losers, picks),
      groupId: data.groupId,
    });

    const after = await this.organizations.getOrganizationById(winner.id);
    if (before && after) {
      await this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
        entityId: winner.id,
        payload: { organization: after, changes: calculateChanges(before, after) },
      });
    }
    for (const loser of loserDtos) {
      if (loser)
        await this.eventService.publish(DomainEvent.ORGANIZATION_DELETED, { entityId: loser.id, payload: loser });
    }

    return { ok: true as const, data: { mergeId, winnerId: winner.id } };
  }
}

@TenantInteractor(MERGE_PERMISSIONS)
export class UndoOrganizationMergeInteractor extends AuthenticatedInteractor<ContactMergeIdData, MergeContactsResult> {
  constructor(
    private repo: OrganizationMergeRepo,
    private organizations: MergeOrganizationReadRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: ContactMergeIdSchema, output: MergeContactsResultSchema, tx: BULK_WRITE_TRANSACTION })
  async invoke(data: ContactMergeIdData): Validated<MergeContactsResult> {
    const merge = await this.repo.findOrganizationMergeOrNull(data.id);
    if (!merge) return failNotFound(CustomErrorCode.contactMergeNotFound, ["id"]);

    const expired = Date.now() - merge.createdAt.getTime() > MERGE_UNDO_DAYS * DAY_MS;
    const winnerId = merge.winnerId;
    if (merge.undoneAt || expired || !winnerId) return failConflict(CustomErrorCode.contactMergeNotUndoable, ["id"]);

    const [taken, winnerExists] = await Promise.all([
      this.repo.organizationIdsThatExist(merge.loserIds),
      this.repo.organizationIdsThatExist([winnerId]),
    ]);
    if (taken.size > 0 || winnerExists.size === 0) return failConflict(CustomErrorCode.contactMergeNotUndoable, ["id"]);

    const before = await this.organizations.getOrganizationById(winnerId);
    await this.repo.undoOrganizationMerge(merge);
    const after = await this.organizations.getOrganizationById(winnerId);

    if (before && after) {
      await this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
        entityId: winnerId,
        payload: { organization: after, changes: calculateChanges(before, after) },
      });
    }
    for (const loserId of merge.loserIds) {
      const restored = await this.organizations.getOrganizationById(loserId);
      if (restored)
        await this.eventService.publish(DomainEvent.ORGANIZATION_CREATED, { entityId: loserId, payload: restored });
    }

    return { ok: true as const, data: { mergeId: merge.id, winnerId } };
  }
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.organizations, action: Action.readAll })
export class GetOrganizationMergesInteractor extends AuthenticatedInteractor<void, ContactMergeRecordDto[]> {
  constructor(private repo: OrganizationMergeRepo) {
    super();
  }

  @ValidateOutput(ContactMergeRecordDtoSchema)
  async invoke(): Validated<ContactMergeRecordDto[]> {
    return { ok: true as const, data: await this.repo.listRecentOrganizationMerges(RECENT_MERGES) };
  }
}
