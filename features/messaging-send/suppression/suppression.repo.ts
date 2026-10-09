import type { SuppressionReason } from "@/generated/prisma";

export type SuppressionEntry = {
  id: string;
  address: string;
  reason: SuppressionReason;
  note: string | null;
  createdAt: Date;
};

export abstract class SuppressionRepo {
  abstract findSuppressed(addresses: readonly string[]): Promise<ReadonlyMap<string, SuppressionReason>>;
  abstract listSuppressions(args: { search: string | null; skip: number; take: number }): Promise<{
    items: SuppressionEntry[];
    total: number;
  }>;
  abstract addSuppressionOrThrow(args: {
    address: string;
    reason: SuppressionReason;
    note: string | null;
  }): Promise<SuppressionEntry>;
  abstract removeSuppression(id: string): Promise<boolean>;
}

export abstract class UnsubscribeTokenRepo {
  abstract storeToken(args: { tokenHash: string; address: string; deliveryId: string | null }): Promise<void>;
}

export type UnsubscribeTarget = { companyId: string; address: string; deliveryId: string | null };

export abstract class UnsubscribeRepo {
  abstract findTokenUnscoped(tokenHash: string): Promise<UnsubscribeTarget | null>;
  abstract isSuppressedUnscoped(target: UnsubscribeTarget): Promise<boolean>;
  abstract suppressUnscoped(target: UnsubscribeTarget, tokenHash: string): Promise<void>;
}
