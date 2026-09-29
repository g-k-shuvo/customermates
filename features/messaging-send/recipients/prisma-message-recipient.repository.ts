import type { MergeRecordRef } from "../render/merge-values.repo";
import type { MessageRecipientRepo, RecipientUser } from "./message-recipient.repo";

import { EntityType, Status } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

const USER_SELECT = { id: true, email: true, displayLanguage: true };
const ACTIVE = { status: Status.active };
const FIRST_ACTIVE_USER = {
  where: { user: ACTIVE },
  orderBy: { createdAt: "asc" as const },
  take: 1,
  select: { user: { select: USER_SELECT } },
};

export class PrismaMessageRecipientRepo extends BaseRepository implements MessageRecipientRepo {
  async findActingUser(): Promise<RecipientUser | null> {
    return await this.prisma.user.findFirst({
      where: { id: this.userId, companyId: this.companyId, ...ACTIVE },
      select: USER_SELECT,
    });
  }

  async findRecordOwner(record: MergeRecordRef): Promise<RecipientUser | null> {
    const id = record.entityId;

    switch (record.entityType) {
      case EntityType.lead: {
        const lead = await this.prisma.lead.findFirst({
          where: { id, ...this.accessWhere("lead") },
          select: { owner: { select: { ...USER_SELECT, status: true } } },
        });

        return lead?.owner?.status === Status.active ? toUser(lead.owner) : null;
      }
      case EntityType.deal:
        return firstUser(
          await this.prisma.deal.findFirst({
            where: { id, ...this.accessWhere("deal") },
            select: { users: FIRST_ACTIVE_USER },
          }),
        );
      case EntityType.contact:
        return firstUser(
          await this.prisma.contact.findFirst({
            where: { id, ...this.accessWhere("contact") },
            select: { users: FIRST_ACTIVE_USER },
          }),
        );
      case EntityType.organization:
        return firstUser(
          await this.prisma.organization.findFirst({
            where: { id, ...this.accessWhere("organization") },
            select: { users: FIRST_ACTIVE_USER },
          }),
        );
      case EntityType.task:
        return firstUser(
          await this.prisma.task.findFirst({
            where: { id, ...this.accessWhere("task") },
            select: { users: FIRST_ACTIVE_USER },
          }),
        );
      default:
        return null;
    }
  }
}

function toUser(user: RecipientUser): RecipientUser {
  return { id: user.id, email: user.email, displayLanguage: user.displayLanguage };
}

function firstUser(record: { users: { user: RecipientUser }[] } | null): RecipientUser | null {
  const user = record?.users[0]?.user;

  return user ? toUser(user) : null;
}
