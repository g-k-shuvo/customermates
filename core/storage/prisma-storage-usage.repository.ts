import type { StorageUsageRepo } from "./storage-quota";

import { BaseRepository } from "@/core/base/base-repository";

export class PrismaStorageUsageRepo extends BaseRepository implements StorageUsageRepo {
  async usedBytesCompanyWide(): Promise<number> {
    const [files, documents, attachments] = await Promise.all([
      this.prisma.recordFile.aggregate({ where: { companyId: this.companyId }, _sum: { byteSize: true } }),
      this.prisma.recordDocumentFile.aggregate({ where: { companyId: this.companyId }, _sum: { byteSize: true } }),
      this.prisma.mailAttachment.aggregate({
        where: { companyId: this.companyId, storageKey: { not: null } },
        _sum: { byteSize: true },
      }),
    ]);

    return (files._sum.byteSize ?? 0) + (documents._sum.byteSize ?? 0) + (attachments._sum.byteSize ?? 0);
  }
}
