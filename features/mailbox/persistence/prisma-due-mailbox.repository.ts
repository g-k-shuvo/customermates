import type { DueMailbox } from "../sync/sync-due-mailboxes.repo";

import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { BaseRepository } from "@/core/base/base-repository";

export class PrismaDueMailboxRepo extends BaseRepository {
  @BypassTenantGuard
  async findDueMailboxesUnscoped(before: Date, limit: number): Promise<DueMailbox[]> {
    const rows = await this.prisma.mailboxCredential.findMany({
      where: { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: before } }] },
      select: {
        companyId: true,
        connectedAccountId: true,
        connectedAccount: { select: { userId: true } },
      },
      orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { connectedAccountId: "asc" }],
      take: limit,
    });

    return rows.map((row) => ({
      companyId: row.companyId,
      userId: row.connectedAccount.userId,
      connectedAccountId: row.connectedAccountId,
    }));
  }
}
