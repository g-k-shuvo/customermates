import type { ContactMergeRepo, StoredMerge } from "./contact-merge.repo";
import type { MergeMember, MergeSnapshot, WinnerUpdate } from "./merge-plan";

import { DuplicateGroupStatus, EntityType, Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { MERGE_UNDO_DAYS } from "../duplicate.schema";

export type CustomFieldValueWriter = {
  replaceValuesForEntity(
    entityType: EntityType,
    entityId: string,
    values: Array<{ columnId: string; value?: string | null }>,
  ): Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  notes: true,
  createdAt: true,
  identifiers: {
    select: {
      id: true,
      provider: true,
      channelClass: true,
      value: true,
      messagingId: true,
      displayName: true,
      profileUrl: true,
    },
  },
  organizations: { select: { organizationId: true } },
  users: { select: { userId: true } },
  deals: { select: { dealId: true } },
  tasks: { select: { taskId: true } },
  customFieldValues: { select: { columnId: true, value: true } },
  leads: { select: { id: true } },
  files: { select: { id: true } },
  documents: { select: { id: true } },
  customFieldRefs: { select: { id: true } },
} as const;

function jsonOrDbNull(value: unknown) {
  return value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function difference(values: readonly string[], present: ReadonlySet<string>) {
  return values.filter((value) => !present.has(value));
}

export class PrismaContactMergeRepo extends BaseRepository implements ContactMergeRepo {
  constructor(private readonly customFields: CustomFieldValueWriter) {
    super();
  }

  async loadMembersOrNull(ids: readonly string[]): Promise<MergeMember[] | null> {
    const rows = await this.prisma.contact.findMany({
      where: { id: { in: [...ids] }, ...this.accessWhere("contact") },
      select: MEMBER_SELECT,
    });
    if (rows.length !== new Set(ids).size) return null;

    const byId = new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          avatarUrl: row.avatarUrl,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
          identifiers: row.identifiers,
          organizationIds: row.organizations.map((entry) => entry.organizationId),
          userIds: row.users.map((entry) => entry.userId),
          dealIds: row.deals.map((entry) => entry.dealId),
          taskIds: row.tasks.map((entry) => entry.taskId),
          customFieldValues: row.customFieldValues.flatMap((entry) =>
            entry.value === null ? [] : [{ columnId: entry.columnId, value: entry.value }],
          ),
          leadIds: row.leads.map((entry) => entry.id),
          fileIds: row.files.map((entry) => entry.id),
          documentIds: row.documents.map((entry) => entry.id),
          refIds: row.customFieldRefs.map((entry) => entry.id),
        } satisfies MergeMember,
      ]),
    );

    return ids.map((id) => byId.get(id) as MergeMember);
  }

  async mergeContacts(args: {
    winner: MergeMember;
    losers: readonly MergeMember[];
    update: WinnerUpdate;
    groupId?: string;
  }): Promise<string> {
    const { companyId } = this;
    const winnerId = args.winner.id;
    const loserIds = args.losers.map((loser) => loser.id);
    const snapshot: MergeSnapshot = { version: 1, winner: args.winner, losers: [...args.losers] };

    const record = await this.prisma.contactMergeRecord.create({
      data: {
        companyId,
        winnerId,
        loserIds,
        groupId: args.groupId ?? null,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        mergedByUserId: this.userId,
      },
      select: { id: true },
    });

    const union = (pick: (member: MergeMember) => string[]) => [...new Set(args.losers.flatMap(pick))];

    await this.prisma.contactIdentifier.updateMany({
      where: { companyId, contactId: { in: loserIds } },
      data: { contactId: winnerId },
    });
    await this.prisma.contactOrganization.createMany({
      data: union((member) => member.organizationIds).map((organizationId) => ({
        companyId,
        contactId: winnerId,
        organizationId,
      })),
      skipDuplicates: true,
    });
    await this.prisma.contactUser.createMany({
      data: union((member) => member.userIds).map((userId) => ({ companyId, contactId: winnerId, userId })),
      skipDuplicates: true,
    });
    await this.prisma.dealContact.createMany({
      data: union((member) => member.dealIds).map((dealId) => ({ companyId, contactId: winnerId, dealId })),
      skipDuplicates: true,
    });
    await this.prisma.taskContact.createMany({
      data: union((member) => member.taskIds).map((taskId) => ({ companyId, contactId: winnerId, taskId })),
      skipDuplicates: true,
    });
    await this.prisma.lead.updateMany({
      where: { companyId, contactId: { in: loserIds } },
      data: { contactId: winnerId },
    });
    await this.prisma.recordFile.updateMany({
      where: { companyId, contactId: { in: loserIds } },
      data: { contactId: winnerId },
    });
    await this.prisma.recordDocument.updateMany({
      where: { companyId, contactId: { in: loserIds } },
      data: { contactId: winnerId },
    });
    await this.prisma.customFieldValue.updateMany({
      where: { companyId, targetContactId: { in: loserIds } },
      data: { targetContactId: winnerId, value: winnerId },
    });

    await this.prisma.contact.deleteMany({ where: { companyId, id: { in: loserIds } } });

    await this.prisma.contact.updateMany({
      where: { companyId, id: winnerId },
      data: {
        firstName: args.update.firstName,
        lastName: args.update.lastName,
        notes: jsonOrDbNull(args.update.notes),
      },
    });
    await this.customFields.replaceValuesForEntity(EntityType.contact, winnerId, args.update.customFieldValues);

    if (args.groupId) {
      await this.prisma.duplicateGroup.updateMany({
        where: { companyId, id: args.groupId },
        data: { status: DuplicateGroupStatus.merged },
      });
    }

    return record.id;
  }

  async findMergeOrNull(id: string): Promise<StoredMerge | null> {
    const row = await this.prisma.contactMergeRecord.findFirst({
      where: { id, companyId: this.companyId },
      select: { id: true, winnerId: true, loserIds: true, snapshot: true, createdAt: true, undoneAt: true },
    });

    return row ? { ...row, snapshot: row.snapshot as unknown as MergeSnapshot } : null;
  }

  async contactIdsThatExist(ids: readonly string[]) {
    const rows = await this.prisma.contact.findMany({
      where: { companyId: this.companyId, id: { in: [...ids] } },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  private async existingIds(model: "organization" | "user" | "deal" | "task", ids: readonly string[]) {
    if (ids.length === 0) return new Set<string>();

    const delegate = this.prisma[model] as unknown as {
      findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    };
    const rows = await delegate.findMany({
      where: { companyId: this.companyId, id: { in: [...ids] } },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  async undoMerge(merge: StoredMerge): Promise<void> {
    const { companyId } = this;
    const { winner, losers } = merge.snapshot;
    const winnerId = winner.id;
    const all = (pick: (member: MergeMember) => string[]) => [...new Set(losers.flatMap(pick))];

    const [organizations, users, deals, tasks] = await Promise.all([
      this.existingIds(
        "organization",
        all((member) => member.organizationIds),
      ),
      this.existingIds(
        "user",
        all((member) => member.userIds),
      ),
      this.existingIds(
        "deal",
        all((member) => member.dealIds),
      ),
      this.existingIds(
        "task",
        all((member) => member.taskIds),
      ),
    ]);

    await this.prisma.contact.createMany({
      data: losers.map((loser) => ({
        id: loser.id,
        companyId,
        firstName: loser.firstName,
        lastName: loser.lastName,
        avatarUrl: loser.avatarUrl,
        notes: jsonOrDbNull(loser.notes),
        createdAt: new Date(loser.createdAt),
      })),
    });

    await this.prisma.contactOrganization.deleteMany({
      where: {
        companyId,
        contactId: winnerId,
        organizationId: {
          in: difference(
            all((member) => member.organizationIds),
            new Set(winner.organizationIds),
          ),
        },
      },
    });
    await this.prisma.contactUser.deleteMany({
      where: {
        companyId,
        contactId: winnerId,
        userId: {
          in: difference(
            all((member) => member.userIds),
            new Set(winner.userIds),
          ),
        },
      },
    });
    await this.prisma.dealContact.deleteMany({
      where: {
        companyId,
        contactId: winnerId,
        dealId: {
          in: difference(
            all((member) => member.dealIds),
            new Set(winner.dealIds),
          ),
        },
      },
    });
    await this.prisma.taskContact.deleteMany({
      where: {
        companyId,
        contactId: winnerId,
        taskId: {
          in: difference(
            all((member) => member.taskIds),
            new Set(winner.taskIds),
          ),
        },
      },
    });

    for (const loser of losers) {
      const contactId = loser.id;

      await this.prisma.contactIdentifier.updateMany({
        where: { companyId, contactId: winnerId, id: { in: loser.identifiers.map((identifier) => identifier.id) } },
        data: { contactId },
      });
      await this.prisma.contactOrganization.createMany({
        data: loser.organizationIds
          .filter((id) => organizations.has(id))
          .map((organizationId) => ({ companyId, contactId, organizationId })),
        skipDuplicates: true,
      });
      await this.prisma.contactUser.createMany({
        data: loser.userIds.filter((id) => users.has(id)).map((userId) => ({ companyId, contactId, userId })),
        skipDuplicates: true,
      });
      await this.prisma.dealContact.createMany({
        data: loser.dealIds.filter((id) => deals.has(id)).map((dealId) => ({ companyId, contactId, dealId })),
        skipDuplicates: true,
      });
      await this.prisma.taskContact.createMany({
        data: loser.taskIds.filter((id) => tasks.has(id)).map((taskId) => ({ companyId, contactId, taskId })),
        skipDuplicates: true,
      });
      await this.prisma.lead.updateMany({
        where: { companyId, contactId: winnerId, id: { in: loser.leadIds } },
        data: { contactId },
      });
      await this.prisma.recordFile.updateMany({
        where: { companyId, contactId: winnerId, id: { in: loser.fileIds } },
        data: { contactId },
      });
      await this.prisma.recordDocument.updateMany({
        where: { companyId, contactId: winnerId, id: { in: loser.documentIds } },
        data: { contactId },
      });
      await this.prisma.customFieldValue.updateMany({
        where: { companyId, targetContactId: winnerId, id: { in: loser.refIds } },
        data: { targetContactId: contactId, value: contactId },
      });
      await this.customFields.replaceValuesForEntity(EntityType.contact, contactId, loser.customFieldValues);
    }

    await this.prisma.contact.updateMany({
      where: { companyId, id: winnerId },
      data: { firstName: winner.firstName, lastName: winner.lastName, notes: jsonOrDbNull(winner.notes) },
    });

    const touchedColumns = [
      ...new Set([winner, ...losers].flatMap((member) => member.customFieldValues.map((entry) => entry.columnId))),
    ];
    await this.customFields.replaceValuesForEntity(
      EntityType.contact,
      winnerId,
      touchedColumns.map((columnId) => ({
        columnId,
        value: winner.customFieldValues.find((entry) => entry.columnId === columnId)?.value ?? null,
      })),
    );

    await this.prisma.contactMergeRecord.updateMany({
      where: { companyId, id: merge.id, undoneAt: null },
      data: { undoneAt: new Date(), undoneByUserId: this.userId },
    });
  }

  async listRecentMerges(take: number) {
    const rows = await this.prisma.contactMergeRecord.findMany({
      where: { companyId: this.companyId },
      select: {
        id: true,
        snapshot: true,
        createdAt: true,
        undoneAt: true,
        winner: { select: { id: true, firstName: true, lastName: true } },
        mergedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    const undoFrom = Date.now() - MERGE_UNDO_DAYS * DAY_MS;

    return rows.map((row) => {
      const snapshot = row.snapshot as unknown as MergeSnapshot;

      return {
        id: row.id,
        winner: row.winner
          ? { id: row.winner.id, name: `${row.winner.firstName} ${row.winner.lastName}`.trim() }
          : null,
        loserNames: snapshot.losers.map((loser) => `${loser.firstName} ${loser.lastName}`.trim()),
        mergedBy: row.mergedBy,
        createdAt: row.createdAt,
        undoneAt: row.undoneAt,
        undoable: row.undoneAt === null && row.winner !== null && row.createdAt.getTime() >= undoFrom,
      };
    });
  }
}
