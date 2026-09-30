import type { SenderIdentityFields, SenderIdentityRepo, SenderIdentityRow } from "./sender-identity.repo";

import { BaseRepository } from "@/core/base/base-repository";

import { domainOf } from "./sender-resolver";

const IDENTITY_SELECT = {
  fromName: true,
  fromAddress: true,
  replyTo: true,
  allowUserSenders: true,
  verificationToken: true,
  verifiedDomain: true,
  verifiedAt: true,
  updatedAt: true,
};

export class PrismaSenderIdentityRepo extends BaseRepository implements SenderIdentityRepo {
  async findIdentityOrNull(): Promise<SenderIdentityRow | null> {
    return await this.prisma.senderIdentity.findUnique({
      where: { companyId: this.companyId },
      select: IDENTITY_SELECT,
    });
  }

  async saveIdentity(fields: SenderIdentityFields, freshToken: string): Promise<SenderIdentityRow> {
    const existing = await this.findIdentityOrNull();
    const sameDomain = existing !== null && domainOf(existing.fromAddress) === domainOf(fields.fromAddress);

    return await this.prisma.senderIdentity.upsert({
      where: { companyId: this.companyId },
      create: { companyId: this.companyId, ...fields, verificationToken: freshToken },
      update: {
        companyId: this.companyId,
        ...fields,
        ...(sameDomain ? {} : { verificationToken: freshToken, verifiedDomain: null, verifiedAt: null }),
      },
      select: IDENTITY_SELECT,
    });
  }

  async markVerified(domain: string): Promise<SenderIdentityRow | null> {
    const updated = await this.prisma.senderIdentity.updateMany({
      where: { companyId: this.companyId },
      data: { verifiedDomain: domain, verifiedAt: new Date() },
    });
    if (updated.count === 0) return null;

    return await this.findIdentityOrNull();
  }

  async deleteIdentity(): Promise<void> {
    await this.prisma.senderIdentity.deleteMany({ where: { companyId: this.companyId } });
  }

  async findUserOrNull(userId: string) {
    return await this.prisma.user.findFirst({
      where: { id: userId, companyId: this.companyId },
      select: { firstName: true, lastName: true, email: true },
    });
  }
}
