import type { StartDuplicateScanRepo } from "./scan/start-duplicate-scan.repo";
import type { RunDuplicateScanRepo, RunningScan } from "./scan/run-duplicate-scan.repo";
import type { GetDuplicateGroupsRepo } from "./get/get-duplicate-groups.repo";
import type { DismissDuplicateGroupRepo } from "./dismiss/dismiss-duplicate-group.repo";
import type {
  DuplicateContactMember,
  DuplicateEntityType,
  DuplicateGroupDto,
  DuplicateMemberDto,
  DuplicateOrganizationMember,
  DuplicateScanDto,
  SkippedBucket,
} from "./duplicate.schema";
import type { DuplicateCluster, KeyedRecord } from "./duplicate-clusters";

import { randomUUID } from "node:crypto";

import { CustomColumnType, DuplicateGroupStatus, DuplicateScanStatus, EntityType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { organizationEmailDomains } from "@/features/mailbox/get/organization-email-domains";
import { contactMatchKeys, organizationMatchKeys } from "./match-keys";
import { pairKey } from "./duplicate-clusters";

const EMAIL_CHANNEL = "email";
const PHONE_CHANNEL = "phone";

const SCAN_SELECT = {
  id: true,
  entityType: true,
  status: true,
  recordCount: true,
  groupCount: true,
  skippedBuckets: true,
  startedAt: true,
  finishedAt: true,
  startedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

const CONTACT_MATCH_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  createdAt: true,
  identifiers: { select: { channelClass: true, value: true } },
  organizations: { select: { organization: { select: { id: true, name: true } } } },
  customFieldValues: { select: { columnId: true, value: true, type: true } },
} as const;

const ORGANIZATION_MATCH_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  contacts: {
    select: {
      contact: { select: { identifiers: { where: { channelClass: EMAIL_CHANNEL }, select: { value: true } } } },
    },
  },
  customFieldValues: { select: { columnId: true, value: true } },
  _count: { select: { contacts: true, deals: true } },
} as const;

type ContactMatchRow = {
  id: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  identifiers: Array<{ channelClass: string; value: string }>;
  organizations: Array<{ organization: { id: string; name: string } }>;
  customFieldValues: Array<{ columnId: string; value: string | null; type: CustomColumnType }>;
};

type OrganizationMatchRow = {
  id: string;
  name: string;
  createdAt: Date;
  contacts: Array<{ contact: { identifiers: Array<{ value: string }> } }>;
  customFieldValues: Array<{ columnId: string; value: string | null }>;
  _count: { contacts: number; deals: number };
};

const MEMBER_FIELD = {
  [EntityType.contact]: "contactId",
  [EntityType.organization]: "organizationId",
} as const satisfies Record<DuplicateEntityType, string>;

function presentValues(values: ReadonlyArray<{ columnId: string; value: string | null }>) {
  return values.flatMap((entry) => (entry.value === null ? [] : [{ columnId: entry.columnId, value: entry.value }]));
}

function toMember(row: ContactMatchRow): DuplicateContactMember {
  const customPhones = row.customFieldValues
    .filter((entry) => entry.type === CustomColumnType.phone)
    .flatMap((entry) =>
      (entry.value ?? "")
        .split(",")
        .map((phone) => phone.trim())
        .filter(Boolean),
    );

  return {
    kind: EntityType.contact,
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    createdAt: row.createdAt,
    emails: row.identifiers.filter((entry) => entry.channelClass === EMAIL_CHANNEL).map((entry) => entry.value),
    phones: [
      ...new Set([
        ...row.identifiers.filter((entry) => entry.channelClass === PHONE_CHANNEL).map((entry) => entry.value),
        ...customPhones,
      ]),
    ],
    organizations: row.organizations.map((entry) => entry.organization),
    customFieldValues: presentValues(row.customFieldValues),
  };
}

function toOrganizationMember(row: OrganizationMatchRow): DuplicateOrganizationMember {
  return {
    kind: EntityType.organization,
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    domains: organizationEmailDomains(
      row.contacts.flatMap((entry) => entry.contact.identifiers.map((identifier) => identifier.value)),
    ),
    contactCount: row._count.contacts,
    dealCount: row._count.deals,
    customFieldValues: presentValues(row.customFieldValues),
  };
}

function toScanDto(row: {
  id: string;
  entityType: EntityType;
  status: DuplicateScanStatus;
  recordCount: number;
  groupCount: number;
  skippedBuckets: unknown;
  startedAt: Date;
  finishedAt: Date | null;
  startedBy: { id: string; firstName: string; lastName: string } | null;
}): DuplicateScanDto {
  return {
    ...row,
    entityType: row.entityType as DuplicateEntityType,
    skippedBuckets: Array.isArray(row.skippedBuckets) ? (row.skippedBuckets as SkippedBucket[]) : [],
  };
}

export class PrismaDuplicateRepo
  extends BaseRepository
  implements StartDuplicateScanRepo, RunDuplicateScanRepo, GetDuplicateGroupsRepo, DismissDuplicateGroupRepo
{
  async findRunningScanOfTypeOrNull(entityType: DuplicateEntityType) {
    return this.prisma.duplicateScan.findFirst({
      where: { companyId: this.companyId, entityType, status: DuplicateScanStatus.running },
      select: { id: true, startedAt: true },
      orderBy: { startedAt: "desc" },
    });
  }

  async findRunningScanOrNull(scanId: string): Promise<RunningScan | null> {
    const scan = await this.prisma.duplicateScan.findFirst({
      where: { id: scanId, companyId: this.companyId, status: DuplicateScanStatus.running },
      select: { id: true, entityType: true },
    });

    return scan ? { id: scan.id, entityType: scan.entityType as DuplicateEntityType } : null;
  }

  async createScan(entityType: DuplicateEntityType) {
    const scan = await this.prisma.duplicateScan.create({
      data: { companyId: this.companyId, entityType, startedByUserId: this.userId },
      select: SCAN_SELECT,
    });

    return toScanDto(scan);
  }

  private async keyPage(entityType: DuplicateEntityType, cursor: string | null, take: number) {
    const page = {
      where: { companyId: this.companyId, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" as const },
      take,
    };

    switch (entityType) {
      case EntityType.contact: {
        const rows = (await this.prisma.contact.findMany({
          ...page,
          select: CONTACT_MATCH_SELECT,
        })) as ContactMatchRow[];
        return rows.map((row) => {
          const member = toMember(row);
          return {
            id: row.id,
            keys: contactMatchKeys({
              firstName: member.firstName,
              lastName: member.lastName,
              emails: member.emails,
              phones: member.phones,
              organizationIds: member.organizations.map((organization) => organization.id),
            }),
          };
        });
      }

      case EntityType.organization: {
        const rows = (await this.prisma.organization.findMany({
          ...page,
          select: ORGANIZATION_MATCH_SELECT,
        })) as OrganizationMatchRow[];
        return rows.map((row) => {
          const member = toOrganizationMember(row);
          return { id: row.id, keys: organizationMatchKeys({ name: member.name, emailDomains: member.domains }) };
        });
      }
    }
  }

  async rebuildKeysPage(entityType: DuplicateEntityType, cursor: string | null, take: number) {
    const keyed = await this.keyPage(entityType, cursor, take);
    if (keyed.length === 0) return { nextCursor: null };

    const field = MEMBER_FIELD[entityType];
    const ids = keyed.map((record) => record.id);
    await this.prisma.contactMatchKey.deleteMany({ where: { companyId: this.companyId, [field]: { in: ids } } });

    const data = keyed.flatMap((record) =>
      record.keys.map((key) => ({
        companyId: this.companyId,
        entityType,
        [field]: record.id,
        kind: key.kind,
        value: key.value,
      })),
    );

    if (data.length > 0) await this.prisma.contactMatchKey.createMany({ data });

    return { nextCursor: keyed.length < take ? null : ids[ids.length - 1] };
  }

  async loadKeys(entityType: DuplicateEntityType): Promise<KeyedRecord[]> {
    const rows = await this.prisma.contactMatchKey.findMany({
      where: { companyId: this.companyId, entityType },
      select: { contactId: true, organizationId: true, kind: true, value: true },
    });

    return rows.flatMap((row) => {
      const recordId = row.contactId ?? row.organizationId;
      return recordId ? [{ recordId, kind: row.kind, value: row.value }] : [];
    });
  }

  async countRecords(entityType: DuplicateEntityType) {
    switch (entityType) {
      case EntityType.contact:
        return this.prisma.contact.count({ where: { companyId: this.companyId } });
      case EntityType.organization:
        return this.prisma.organization.count({ where: { companyId: this.companyId } });
    }
  }

  async loadDismissedPairs(entityType: DuplicateEntityType) {
    const rows = await this.prisma.duplicateDismissal.findMany({
      where: { companyId: this.companyId, entityType },
      select: { leftId: true, rightId: true },
    });

    return new Set(rows.map((row) => pairKey(row.leftId, row.rightId)));
  }

  async replaceOpenGroups(scan: RunningScan, clusters: readonly DuplicateCluster[]) {
    await this.prisma.duplicateGroup.deleteMany({
      where: { companyId: this.companyId, entityType: scan.entityType, status: DuplicateGroupStatus.open },
    });

    const groups = clusters.map((cluster) => ({ id: randomUUID(), cluster }));
    if (groups.length === 0) return;

    await this.prisma.duplicateGroup.createMany({
      data: groups.map(({ id, cluster }) => ({
        id,
        companyId: this.companyId,
        scanId: scan.id,
        entityType: scan.entityType,
        fingerprint: cluster.fingerprint,
        score: cluster.score,
        signals: cluster.signals,
      })),
    });

    await this.prisma.duplicateMember.createMany({
      data: groups.flatMap(({ id, cluster }) =>
        cluster.recordIds.map((recordId) => ({
          companyId: this.companyId,
          groupId: id,
          [MEMBER_FIELD[scan.entityType]]: recordId,
        })),
      ),
    });
  }

  async completeScan(
    scanId: string,
    summary: { recordCount: number; groupCount: number; skippedBuckets: SkippedBucket[] },
  ) {
    await this.prisma.duplicateScan.updateMany({
      where: { id: scanId, companyId: this.companyId },
      data: { ...summary, status: DuplicateScanStatus.completed, finishedAt: new Date() },
    });
  }

  async failScan(scanId: string) {
    await this.prisma.duplicateScan.updateMany({
      where: { id: scanId, companyId: this.companyId, status: DuplicateScanStatus.running },
      data: { status: DuplicateScanStatus.failed, finishedAt: new Date() },
    });
  }

  async findLatestScanOrNull(entityType: DuplicateEntityType) {
    const scan = await this.prisma.duplicateScan.findFirst({
      where: { companyId: this.companyId, entityType },
      select: SCAN_SELECT,
      orderBy: { startedAt: "desc" },
    });

    return scan ? toScanDto(scan) : null;
  }

  private openGroupsWhere(entityType: DuplicateEntityType) {
    return {
      companyId: this.companyId,
      entityType,
      status: DuplicateGroupStatus.open,
      members: { some: {} },
    };
  }

  async listOpenGroups(entityType: DuplicateEntityType, skip: number, take: number): Promise<DuplicateGroupDto[]> {
    const groups = await this.prisma.duplicateGroup.findMany({
      where: this.openGroupsWhere(entityType),
      select: {
        id: true,
        status: true,
        score: true,
        signals: true,
        members: {
          select: {
            contact: { select: CONTACT_MATCH_SELECT },
            organization: { select: ORGANIZATION_MATCH_SELECT },
          },
        },
      },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      skip,
      take,
    });

    return groups.map((group) => ({
      id: group.id,
      status: group.status,
      score: group.score,
      signals: group.signals,
      members: group.members
        .flatMap((member): DuplicateMemberDto[] => {
          if (member.contact) return [toMember(member.contact as ContactMatchRow)];
          if (member.organization) return [toOrganizationMember(member.organization as OrganizationMatchRow)];
          return [];
        })
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
    }));
  }

  async countOpenGroups(entityType: DuplicateEntityType) {
    return this.prisma.duplicateGroup.count({ where: this.openGroupsWhere(entityType) });
  }

  async findOpenGroupOrNull(id: string) {
    const group = await this.prisma.duplicateGroup.findFirst({
      where: { id, companyId: this.companyId, status: DuplicateGroupStatus.open },
      select: { entityType: true, members: { select: { contactId: true, organizationId: true } } },
    });

    if (!group) return null;

    return {
      entityType: group.entityType as DuplicateEntityType,
      memberIds: group.members.flatMap((member) => {
        const recordId = member.contactId ?? member.organizationId;
        return recordId ? [recordId] : [];
      }),
    };
  }

  async dismissGroup(id: string, entityType: DuplicateEntityType, pairs: Array<[string, string]>) {
    await this.prisma.duplicateGroup.updateMany({
      where: { id, companyId: this.companyId, status: DuplicateGroupStatus.open },
      data: { status: DuplicateGroupStatus.dismissed },
    });

    if (pairs.length === 0) return;

    await this.prisma.duplicateDismissal.createMany({
      data: pairs.map(([leftId, rightId]) => ({
        companyId: this.companyId,
        entityType,
        leftId,
        rightId,
        dismissedByUserId: this.userId,
      })),
      skipDuplicates: true,
    });
  }

  async recordIdsThatExist(entityType: DuplicateEntityType, ids: readonly string[]) {
    const where = { companyId: this.companyId, id: { in: [...ids] } };
    const rows =
      entityType === EntityType.contact
        ? await this.prisma.contact.findMany({ where, select: { id: true } })
        : await this.prisma.organization.findMany({ where, select: { id: true } });

    return new Set(rows.map((row) => row.id));
  }

  async openReviewGroup(entityType: DuplicateEntityType, cluster: DuplicateCluster) {
    const field = MEMBER_FIELD[entityType];
    const alreadyOpen = await this.prisma.duplicateGroup.findFirst({
      where: {
        companyId: this.companyId,
        entityType,
        status: DuplicateGroupStatus.open,
        AND: cluster.recordIds.map((recordId) => ({ members: { some: { [field]: recordId } } })),
      },
      select: { id: true },
    });
    if (alreadyOpen) return alreadyOpen.id;

    const group = await this.prisma.duplicateGroup.create({
      data: {
        companyId: this.companyId,
        entityType,
        fingerprint: cluster.fingerprint,
        score: cluster.score,
        signals: cluster.signals,
        members: {
          create: cluster.recordIds.map((recordId) => ({ companyId: this.companyId, [field]: recordId })),
        },
      },
      select: { id: true },
    });

    return group.id;
  }
}
