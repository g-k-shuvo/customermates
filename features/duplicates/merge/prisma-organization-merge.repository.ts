import type { OrganizationMergeRepo, StoredOrganizationMerge } from "./organization-merge.repo";
import type { OrganizationMergeMember, OrganizationMergeSnapshot, OrganizationUpdate } from "./merge-plan";
import type { CustomFieldValueWriter } from "./prisma-contact-merge.repository";

import { DuplicateGroupStatus, EntityType, Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { MERGE_UNDO_DAYS } from "../duplicate.schema";

const DAY_MS = 24 * 60 * 60 * 1000;

const MEMBER_SELECT = {
  id: true,
  name: true,
  notes: true,
  createdAt: true,
  contacts: { select: { contactId: true } },
  deals: { select: { dealId: true } },
  users: { select: { userId: true } },
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

export class PrismaOrganizationMergeRepo extends BaseRepository implements OrganizationMergeRepo {
  constructor(private readonly customFields: CustomFieldValueWriter) {
    super();
  }

  async loadOrganizationsOrNull(ids: readonly string[]): Promise<OrganizationMergeMember[] | null> {
    const rows = await this.prisma.organization.findMany({
      where: { id: { in: [...ids] }, ...this.accessWhere("organization") },
      select: MEMBER_SELECT,
    });
    if (rows.length !== new Set(ids).size) return null;

    const byId = new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
          contactIds: row.contacts.map((entry) => entry.contactId),
          dealIds: row.deals.map((entry) => entry.dealId),
          userIds: row.users.map((entry) => entry.userId),
          taskIds: row.tasks.map((entry) => entry.taskId),
          customFieldValues: row.customFieldValues.flatMap((entry) =>
            entry.value === null ? [] : [{ columnId: entry.columnId, value: entry.value }],
          ),
          leadIds: row.leads.map((entry) => entry.id),
          fileIds: row.files.map((entry) => entry.id),
          documentIds: row.documents.map((entry) => entry.id),
          refIds: row.customFieldRefs.map((entry) => entry.id),
        } satisfies OrganizationMergeMember,
      ]),
    );

    return ids.map((id) => byId.get(id) as OrganizationMergeMember);
  }

  async mergeOrganizations(args: {
    winner: OrganizationMergeMember;
    losers: readonly OrganizationMergeMember[];
    update: OrganizationUpdate;
    groupId?: string;
  }): Promise<string> {
    const { companyId } = this;
    const organizationId = args.winner.id;
    const loserIds = args.losers.map((loser) => loser.id);
    const snapshot: OrganizationMergeSnapshot = { version: 1, winner: args.winner, losers: [...args.losers] };
    const union = (pick: (member: OrganizationMergeMember) => string[]) => [...new Set(args.losers.flatMap(pick))];

    const record = await this.prisma.organizationMergeRecord.create({
      data: {
        companyId,
        winnerId: organizationId,
        loserIds,
        groupId: args.groupId ?? null,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        mergedByUserId: this.userId,
      },
      select: { id: true },
    });

    await this.prisma.contactOrganization.createMany({
      data: union((member) => member.contactIds).map((contactId) => ({ companyId, contactId, organizationId })),
      skipDuplicates: true,
    });
    await this.prisma.dealOrganization.createMany({
      data: union((member) => member.dealIds).map((dealId) => ({ companyId, dealId, organizationId })),
      skipDuplicates: true,
    });
    await this.prisma.organizationUser.createMany({
      data: union((member) => member.userIds).map((userId) => ({ companyId, userId, organizationId })),
      skipDuplicates: true,
    });
    await this.prisma.taskOrganization.createMany({
      data: union((member) => member.taskIds).map((taskId) => ({ companyId, taskId, organizationId })),
      skipDuplicates: true,
    });
    await this.prisma.lead.updateMany({
      where: { companyId, organizationId: { in: loserIds } },
      data: { organizationId },
    });
    await this.prisma.recordFile.updateMany({
      where: { companyId, organizationId: { in: loserIds } },
      data: { organizationId },
    });
    await this.prisma.recordDocument.updateMany({
      where: { companyId, organizationId: { in: loserIds } },
      data: { organizationId },
    });
    await this.prisma.customFieldValue.updateMany({
      where: { companyId, targetOrganizationId: { in: loserIds } },
      data: { targetOrganizationId: organizationId, value: organizationId },
    });

    await this.prisma.organization.deleteMany({ where: { companyId, id: { in: loserIds } } });

    await this.prisma.organization.updateMany({
      where: { companyId, id: organizationId },
      data: { name: args.update.name, notes: jsonOrDbNull(args.update.notes) },
    });
    await this.customFields.replaceValuesForEntity(
      EntityType.organization,
      organizationId,
      args.update.customFieldValues,
    );

    if (args.groupId) {
      await this.prisma.duplicateGroup.updateMany({
        where: { companyId, id: args.groupId },
        data: { status: DuplicateGroupStatus.merged },
      });
    }

    return record.id;
  }

  async findOrganizationMergeOrNull(id: string): Promise<StoredOrganizationMerge | null> {
    const row = await this.prisma.organizationMergeRecord.findFirst({
      where: { id, companyId: this.companyId },
      select: { id: true, winnerId: true, loserIds: true, snapshot: true, createdAt: true, undoneAt: true },
    });

    return row ? { ...row, snapshot: row.snapshot as unknown as OrganizationMergeSnapshot } : null;
  }

  async organizationIdsThatExist(ids: readonly string[]) {
    const rows = await this.prisma.organization.findMany({
      where: { companyId: this.companyId, id: { in: [...ids] } },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  private async existingIds(model: "contact" | "user" | "deal" | "task", ids: readonly string[]) {
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

  async undoOrganizationMerge(merge: StoredOrganizationMerge): Promise<void> {
    const { companyId } = this;
    const { winner, losers } = merge.snapshot;
    const winnerId = winner.id;
    const all = (pick: (member: OrganizationMergeMember) => string[]) => [...new Set(losers.flatMap(pick))];

    const [contacts, deals, users, tasks] = await Promise.all([
      this.existingIds(
        "contact",
        all((member) => member.contactIds),
      ),
      this.existingIds(
        "deal",
        all((member) => member.dealIds),
      ),
      this.existingIds(
        "user",
        all((member) => member.userIds),
      ),
      this.existingIds(
        "task",
        all((member) => member.taskIds),
      ),
    ]);

    await this.prisma.organization.createMany({
      data: losers.map((loser) => ({
        id: loser.id,
        companyId,
        name: loser.name,
        notes: jsonOrDbNull(loser.notes),
        createdAt: new Date(loser.createdAt),
      })),
    });

    await this.prisma.contactOrganization.deleteMany({
      where: {
        companyId,
        organizationId: winnerId,
        contactId: {
          in: difference(
            all((member) => member.contactIds),
            new Set(winner.contactIds),
          ),
        },
      },
    });
    await this.prisma.dealOrganization.deleteMany({
      where: {
        companyId,
        organizationId: winnerId,
        dealId: {
          in: difference(
            all((member) => member.dealIds),
            new Set(winner.dealIds),
          ),
        },
      },
    });
    await this.prisma.organizationUser.deleteMany({
      where: {
        companyId,
        organizationId: winnerId,
        userId: {
          in: difference(
            all((member) => member.userIds),
            new Set(winner.userIds),
          ),
        },
      },
    });
    await this.prisma.taskOrganization.deleteMany({
      where: {
        companyId,
        organizationId: winnerId,
        taskId: {
          in: difference(
            all((member) => member.taskIds),
            new Set(winner.taskIds),
          ),
        },
      },
    });

    for (const loser of losers) {
      const organizationId = loser.id;

      await this.prisma.contactOrganization.createMany({
        data: loser.contactIds
          .filter((id) => contacts.has(id))
          .map((contactId) => ({ companyId, contactId, organizationId })),
        skipDuplicates: true,
      });
      await this.prisma.dealOrganization.createMany({
        data: loser.dealIds.filter((id) => deals.has(id)).map((dealId) => ({ companyId, dealId, organizationId })),
        skipDuplicates: true,
      });
      await this.prisma.organizationUser.createMany({
        data: loser.userIds.filter((id) => users.has(id)).map((userId) => ({ companyId, userId, organizationId })),
        skipDuplicates: true,
      });
      await this.prisma.taskOrganization.createMany({
        data: loser.taskIds.filter((id) => tasks.has(id)).map((taskId) => ({ companyId, taskId, organizationId })),
        skipDuplicates: true,
      });
      await this.prisma.lead.updateMany({
        where: { companyId, organizationId: winnerId, id: { in: loser.leadIds } },
        data: { organizationId },
      });
      await this.prisma.recordFile.updateMany({
        where: { companyId, organizationId: winnerId, id: { in: loser.fileIds } },
        data: { organizationId },
      });
      await this.prisma.recordDocument.updateMany({
        where: { companyId, organizationId: winnerId, id: { in: loser.documentIds } },
        data: { organizationId },
      });
      await this.prisma.customFieldValue.updateMany({
        where: { companyId, targetOrganizationId: winnerId, id: { in: loser.refIds } },
        data: { targetOrganizationId: organizationId, value: organizationId },
      });
      await this.customFields.replaceValuesForEntity(EntityType.organization, organizationId, loser.customFieldValues);
    }

    await this.prisma.organization.updateMany({
      where: { companyId, id: winnerId },
      data: { name: winner.name, notes: jsonOrDbNull(winner.notes) },
    });

    const touchedColumns = [
      ...new Set([winner, ...losers].flatMap((member) => member.customFieldValues.map((entry) => entry.columnId))),
    ];
    await this.customFields.replaceValuesForEntity(
      EntityType.organization,
      winnerId,
      touchedColumns.map((columnId) => ({
        columnId,
        value: winner.customFieldValues.find((entry) => entry.columnId === columnId)?.value ?? null,
      })),
    );

    await this.prisma.organizationMergeRecord.updateMany({
      where: { companyId, id: merge.id, undoneAt: null },
      data: { undoneAt: new Date(), undoneByUserId: this.userId },
    });
  }

  async listRecentOrganizationMerges(take: number) {
    const rows = await this.prisma.organizationMergeRecord.findMany({
      where: { companyId: this.companyId },
      select: {
        id: true,
        winnerId: true,
        mergedByUserId: true,
        snapshot: true,
        createdAt: true,
        undoneAt: true,
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    const winnerIds = rows.flatMap((row) => (row.winnerId ? [row.winnerId] : []));
    const userIds = rows.flatMap((row) => (row.mergedByUserId ? [row.mergedByUserId] : []));
    const [winners, users] = await Promise.all([
      this.prisma.organization.findMany({
        where: { companyId: this.companyId, id: { in: winnerIds } },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: { companyId: this.companyId, id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const winnerById = new Map(winners.map((winner) => [winner.id, winner]));
    const userById = new Map(users.map((user) => [user.id, user]));
    const undoFrom = Date.now() - MERGE_UNDO_DAYS * DAY_MS;

    return rows.map((row) => {
      const snapshot = row.snapshot as unknown as OrganizationMergeSnapshot;
      const winner = row.winnerId ? (winnerById.get(row.winnerId) ?? null) : null;

      return {
        id: row.id,
        winner,
        loserNames: snapshot.losers.map((loser) => loser.name),
        mergedBy: row.mergedByUserId ? (userById.get(row.mergedByUserId) ?? null) : null,
        createdAt: row.createdAt,
        undoneAt: row.undoneAt,
        undoable: row.undoneAt === null && winner !== null && row.createdAt.getTime() >= undoFrom,
      };
    });
  }
}
