import type { FindRelationTargetsRepo } from "./relation-target.repo";
import type { RelationTargetEntityType } from "./relation-target";

import { EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

export class PrismaRelationTargetRepo extends BaseRepository implements FindRelationTargetsRepo {
  async findLabels(targetEntityType: RelationTargetEntityType, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, string>();

    switch (targetEntityType) {
      case EntityType.contact: {
        const contacts = await this.prisma.contact.findMany({
          where: { id: { in: unique }, ...this.accessWhere("contact") },
          select: { id: true, firstName: true, lastName: true },
        });
        return new Map(contacts.map((contact) => [contact.id, `${contact.firstName} ${contact.lastName}`.trim()]));
      }

      case EntityType.organization: {
        const organizations = await this.prisma.organization.findMany({
          where: { id: { in: unique }, ...this.accessWhere("organization") },
          select: { id: true, name: true },
        });
        return new Map(organizations.map((organization) => [organization.id, organization.name]));
      }

      case EntityType.deal: {
        const deals = await this.prisma.deal.findMany({
          where: { id: { in: unique }, ...this.accessWhere("deal") },
          select: { id: true, name: true },
        });
        return new Map(deals.map((deal) => [deal.id, deal.name]));
      }
    }
  }
}
