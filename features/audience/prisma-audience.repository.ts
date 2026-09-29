import type { AudienceRepo, UnknownAudienceReferences } from "./audience.repo";
import type { AudienceCondition, AudienceDefinition, AudiencePredicate, AudienceRecipient } from "./audience.schema";

import { EntityType, type Prisma } from "@/generated/prisma";

import { audiencePredicates } from "./audience.schema";

import { BaseRepository } from "@/core/base/base-repository";

const EMAIL_CHANNEL = "email";
const HAS_EMAIL: Prisma.ContactWhereInput = { identifiers: { some: { channelClass: EMAIL_CHANNEL } } };

function predicateWhere(predicate: AudiencePredicate): Prisma.ContactWhereInput {
  switch (predicate.kind) {
    case "onList":
      return { listMemberships: { some: { listId: predicate.listId } } };
    case "notOnList":
      return { listMemberships: { none: { listId: predicate.listId } } };
    case "contactField":
      return { customFieldValues: { some: { columnId: predicate.columnId, value: { in: predicate.values } } } };
    case "organizationField":
      return {
        organizations: {
          some: {
            organization: {
              customFieldValues: { some: { columnId: predicate.columnId, value: { in: predicate.values } } },
            },
          },
        },
      };
  }
}

function conditionWhere(condition: AudienceCondition): Prisma.ContactWhereInput {
  if (condition.kind === "anyOf") return { OR: condition.conditions.map(predicateWhere) };
  if (condition.kind === "noneOf") return { NOT: condition.conditions.map(predicateWhere) };

  return predicateWhere(condition);
}

export class PrismaAudienceRepo extends BaseRepository implements AudienceRepo {
  private audienceWhere(definition: AudienceDefinition, extra: Prisma.ContactWhereInput[] = []) {
    return {
      companyId: this.companyId,
      AND: [this.accessWhere("contact"), ...definition.conditions.map(conditionWhere), ...extra],
    };
  }

  async findUnknownReferences(definition: AudienceDefinition): Promise<UnknownAudienceReferences> {
    const listIds = [
      ...new Set(
        audiencePredicates(definition).flatMap((predicate) =>
          predicate.kind === "onList" || predicate.kind === "notOnList" ? [predicate.listId] : [],
        ),
      ),
    ];
    const columns = audiencePredicates(definition).flatMap((predicate): { id: string; entityType: EntityType }[] =>
      predicate.kind === "contactField"
        ? [{ id: predicate.columnId, entityType: EntityType.contact }]
        : predicate.kind === "organizationField"
          ? [{ id: predicate.columnId, entityType: EntityType.organization }]
          : [],
    );

    const [lists, knownColumns] = await Promise.all([
      this.prisma.contactList.findMany({
        where: { companyId: this.companyId, id: { in: listIds } },
        select: { id: true },
      }),
      this.prisma.customColumn.findMany({
        where: { companyId: this.companyId, id: { in: columns.map((column) => column.id) } },
        select: { id: true, entityType: true },
      }),
    ]);
    const knownListIds = new Set(lists.map((list) => list.id));

    return {
      listIds: listIds.filter((id) => !knownListIds.has(id)),
      columnIds: columns
        .filter(
          (column) => !knownColumns.some((known) => known.id === column.id && known.entityType === column.entityType),
        )
        .map((column) => column.id),
    };
  }

  async countAudience(definition: AudienceDefinition): Promise<{ count: number; withoutEmail: number }> {
    const [count, all] = await Promise.all([
      this.prisma.contact.count({ where: this.audienceWhere(definition, [HAS_EMAIL]) }),
      this.prisma.contact.count({ where: this.audienceWhere(definition) }),
    ]);

    return { count, withoutEmail: all - count };
  }

  async findRecipientsPage(
    definition: AudienceDefinition,
    cursor: string | null,
    take: number,
  ): Promise<AudienceRecipient[]> {
    const rows = await this.prisma.contact.findMany({
      where: this.audienceWhere(definition, [HAS_EMAIL, ...(cursor ? [{ id: { gt: cursor } }] : [])]),
      orderBy: { id: "asc" },
      take,
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
        organizations: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { organization: { select: { name: true } } },
        },
      },
    });

    return rows.flatMap((row) =>
      row.identifiers[0]
        ? [
            {
              contactId: row.id,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.identifiers[0].value,
              organizationName: row.organizations[0]?.organization.name ?? null,
            },
          ]
        : [],
    );
  }
}
