import type { MergeRecordRef, MergeSource, MergeValuesRepo } from "./merge-values.repo";

import { EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

const EMAIL_CHANNEL = "email";

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  identifiers: {
    where: { channelClass: EMAIL_CHANNEL },
    orderBy: { createdAt: "asc" as const },
    take: 1,
    select: { value: true },
  },
  organizations: {
    orderBy: { createdAt: "asc" as const },
    take: 1,
    select: { organization: { select: { name: true } } },
  },
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  identifiers: { value: string }[];
  organizations: { organization: { name: string } }[];
};

const toContact = (row: ContactRow | null | undefined) =>
  row
    ? { id: row.id, firstName: row.firstName, lastName: row.lastName, email: row.identifiers[0]?.value ?? null }
    : null;

export class PrismaMergeValuesRepo extends BaseRepository implements MergeValuesRepo {
  async loadMergeSource(record: MergeRecordRef | null, senderUserId: string | null): Promise<MergeSource> {
    const sender = senderUserId
      ? await this.prisma.user.findFirst({
          where: { id: senderUserId, companyId: this.companyId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null;
    const base = { contact: null, organizationName: null, dealName: null, sender };
    if (!record) return base;

    if (record.entityType === EntityType.contact) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: record.entityId, ...this.accessWhere("contact") },
        select: CONTACT_SELECT,
      });

      return {
        ...base,
        contact: toContact(contact),
        organizationName: contact?.organizations[0]?.organization.name ?? null,
      };
    }

    if (record.entityType === EntityType.deal) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: record.entityId, ...this.accessWhere("deal") },
        select: {
          name: true,
          contacts: { orderBy: { createdAt: "asc" }, take: 1, select: { contact: { select: CONTACT_SELECT } } },
          organizations: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { organization: { select: { name: true } } },
          },
        },
      });
      const contact = deal?.contacts[0]?.contact;

      return {
        ...base,
        dealName: deal?.name ?? null,
        contact: toContact(contact),
        organizationName:
          deal?.organizations[0]?.organization.name ?? contact?.organizations[0]?.organization.name ?? null,
      };
    }

    if (record.entityType === EntityType.lead) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: record.entityId, ...this.accessWhere("lead") },
        select: { contact: { select: CONTACT_SELECT }, organization: { select: { name: true } } },
      });

      return {
        ...base,
        contact: toContact(lead?.contact),
        organizationName: lead?.organization?.name ?? lead?.contact?.organizations[0]?.organization.name ?? null,
      };
    }

    if (record.entityType === EntityType.organization) {
      const organization = await this.prisma.organization.findFirst({
        where: { id: record.entityId, ...this.accessWhere("organization") },
        select: { name: true },
      });

      return { ...base, organizationName: organization?.name ?? null };
    }

    return base;
  }
}
