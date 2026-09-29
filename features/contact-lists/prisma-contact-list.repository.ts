import type { ContactListRepo } from "./contact-list.repo";
import type { ContactListDto, ContactListMembersDto } from "./contact-list.schema";

import { BaseRepository } from "@/core/base/base-repository";

const EMAIL_CHANNEL = "email";

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true } },
} as const;

type ListRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { members: number };
};

const toDto = ({ _count, ...row }: ListRow): ContactListDto => ({ ...row, memberCount: _count.members });

export class PrismaContactListRepo extends BaseRepository implements ContactListRepo {
  async findListsCompanyWide(): Promise<ContactListDto[]> {
    const rows = await this.prisma.contactList.findMany({
      where: { companyId: this.companyId },
      orderBy: { name: "asc" },
      select: LIST_SELECT,
    });

    return rows.map(toDto);
  }

  async findListOrNull(id: string): Promise<ContactListDto | null> {
    const row = await this.prisma.contactList.findFirst({
      where: { id, companyId: this.companyId },
      select: LIST_SELECT,
    });

    return row ? toDto(row) : null;
  }

  async listNameTaken(name: string, exceptId: string | null): Promise<boolean> {
    const existing = await this.prisma.contactList.findFirst({
      where: { companyId: this.companyId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });

    return Boolean(existing && existing.id !== exceptId);
  }

  async createList(args: { name: string; description: string | null }): Promise<ContactListDto> {
    return toDto(
      await this.prisma.contactList.create({
        data: { companyId: this.companyId, createdById: this.userId, ...args },
        select: LIST_SELECT,
      }),
    );
  }

  async updateList(args: { id: string; name: string; description: string | null }): Promise<void> {
    await this.prisma.contactList.updateMany({
      where: { id: args.id, companyId: this.companyId },
      data: { name: args.name, description: args.description },
    });
  }

  async deleteList(id: string): Promise<void> {
    await this.prisma.contactList.deleteMany({ where: { id, companyId: this.companyId } });
  }

  async findMembers(id: string, page: number, pageSize: number): Promise<ContactListMembersDto> {
    const where = { listId: id, companyId: this.companyId, contact: this.accessWhere("contact") };
    const [total, rows] = await Promise.all([
      this.prisma.contactListMember.count({ where }),
      this.prisma.contactListMember.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          createdAt: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              identifiers: {
                where: { channelClass: EMAIL_CHANNEL },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { value: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => ({
        contactId: row.contact.id,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        email: row.contact.identifiers[0]?.value ?? null,
        addedAt: row.createdAt,
      })),
    };
  }

  async findAccessibleContactIds(contactIds: string[]): Promise<string[]> {
    const rows = await this.prisma.contact.findMany({
      where: { id: { in: contactIds }, ...this.accessWhere("contact") },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  async addMembers(listId: string, contactIds: string[], jobId: string | null): Promise<number> {
    if (contactIds.length === 0) return 0;

    const { count } = await this.prisma.contactListMember.createMany({
      data: contactIds.map((contactId) => ({
        companyId: this.companyId,
        listId,
        contactId,
        addedById: this.userId,
        jobId,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  async removeMembers(listId: string, contactIds: string[]): Promise<number> {
    const { count } = await this.prisma.contactListMember.deleteMany({
      where: { listId, companyId: this.companyId, contactId: { in: contactIds } },
    });

    return count;
  }
}
