export type StorageUsage = { usedBytes: number; quotaBytes: number | null };

export abstract class StorageUsageRepo {
  abstract usedBytesCompanyWide(): Promise<number>;
}

export const STORAGE_QUOTA_MB_CEILING = 10 * 1024 * 1024;

export function storageQuotaBytesOf(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;

  const megabytes = Number(value);
  if (!Number.isInteger(megabytes) || megabytes < 1 || megabytes > STORAGE_QUOTA_MB_CEILING)
    throw new Error(`STORAGE_QUOTA_MB must be a whole number of megabytes between 1 and ${STORAGE_QUOTA_MB_CEILING}`);

  return megabytes * 1024 * 1024;
}

export class StorageQuota {
  constructor(
    private repo: StorageUsageRepo,
    private quotaBytes: number | null,
  ) {}

  get limited(): boolean {
    return this.quotaBytes !== null;
  }

  async usage(): Promise<StorageUsage> {
    return { usedBytes: await this.repo.usedBytesCompanyWide(), quotaBytes: this.quotaBytes };
  }

  async allows(extraBytes: number): Promise<boolean> {
    if (this.quotaBytes === null) return true;

    return (await this.repo.usedBytesCompanyWide()) + extraBytes <= this.quotaBytes;
  }
}
