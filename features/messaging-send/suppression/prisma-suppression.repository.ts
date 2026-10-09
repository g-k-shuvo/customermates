import type {
  SuppressionEntry,
  SuppressionRepo,
  UnsubscribeRepo,
  UnsubscribeTarget,
  UnsubscribeTokenRepo,
} from "./suppression.repo";

import { SuppressionReason } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

import { SUPPRESSION_BATCH_LIMIT, normalizeAddress } from "../messaging-send.contract";

const ENTRY_SELECT = { id: true, address: true, reason: true, note: true, createdAt: true };

export class PrismaSuppressionRepo
  extends BaseRepository
  implements SuppressionRepo, UnsubscribeTokenRepo, UnsubscribeRepo
{
  async findSuppressed(addresses: readonly string[]): Promise<ReadonlyMap<string, SuppressionReason>> {
    if (addresses.length > SUPPRESSION_BATCH_LIMIT)
      throw new Error(`findSuppressed takes at most ${SUPPRESSION_BATCH_LIMIT} addresses`);

    const rows = await this.prisma.messageSuppression.findMany({
      where: { companyId: this.companyId, address: { in: addresses.map(normalizeAddress) } },
      select: { address: true, reason: true },
    });

    return new Map(rows.map((row) => [row.address, row.reason]));
  }

  async listSuppressions(args: { search: string | null; skip: number; take: number }) {
    const where = {
      companyId: this.companyId,
      ...(args.search ? { address: { contains: normalizeAddress(args.search) } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.messageSuppression.findMany({
        where,
        select: ENTRY_SELECT,
        orderBy: { createdAt: "desc" },
        skip: args.skip,
        take: args.take,
      }),
      this.prisma.messageSuppression.count({ where }),
    ]);

    return { items, total };
  }

  async addSuppressionOrThrow(args: {
    address: string;
    reason: SuppressionReason;
    note: string | null;
  }): Promise<SuppressionEntry> {
    const address = normalizeAddress(args.address);

    await this.prisma.messageSuppression.createMany({
      data: [
        { companyId: this.companyId, address, reason: args.reason, note: args.note, createdByUserId: this.userId },
      ],
      skipDuplicates: true,
    });

    return await this.prisma.messageSuppression.findFirstOrThrow({
      where: { companyId: this.companyId, address },
      select: ENTRY_SELECT,
    });
  }

  async removeSuppression(id: string): Promise<boolean> {
    const deleted = await this.prisma.messageSuppression.deleteMany({ where: { id, companyId: this.companyId } });

    return deleted.count === 1;
  }

  async storeToken(args: { tokenHash: string; address: string; deliveryId: string | null }): Promise<void> {
    await this.prisma.unsubscribeToken.create({
      data: {
        companyId: this.companyId,
        tokenHash: args.tokenHash,
        address: normalizeAddress(args.address),
        deliveryId: args.deliveryId,
      },
    });
  }

  @BypassTenantGuard
  async findTokenUnscoped(tokenHash: string): Promise<UnsubscribeTarget | null> {
    return await this.prisma.unsubscribeToken.findUnique({
      where: { tokenHash },
      select: { companyId: true, address: true, deliveryId: true },
    });
  }

  @BypassTenantGuard
  async isSuppressedUnscoped(target: UnsubscribeTarget): Promise<boolean> {
    const row = await this.prisma.messageSuppression.findUnique({
      where: { companyId_address: { companyId: target.companyId, address: target.address } },
      select: { id: true },
    });

    return row !== null;
  }

  @BypassTenantGuard
  async suppressUnscoped(target: UnsubscribeTarget, tokenHash: string): Promise<void> {
    await this.prisma.messageSuppression.createMany({
      data: [
        {
          companyId: target.companyId,
          address: target.address,
          reason: SuppressionReason.unsubscribed,
          deliveryId: target.deliveryId,
        },
      ],
      skipDuplicates: true,
    });
    await this.prisma.unsubscribeToken.updateMany({
      where: { tokenHash, companyId: target.companyId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
