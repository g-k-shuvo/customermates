import type {
  EmailInvitation,
  IssueEmailInvitationRepo,
  ManageInvitationRepo,
  PendingInvitationsRepo,
} from "./invitation.repo";
import type { PendingInvitationDto } from "./invitation.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";

export class PrismaInvitationRepo
  extends BaseRepository
  implements IssueEmailInvitationRepo, PendingInvitationsRepo, ManageInvitationRepo
{
  @Transaction
  async issueEmailInviteToken(args: { email: string; token: string; expiresAt: Date }): Promise<string> {
    const existing = await this.prisma.inviteToken.findFirst({
      where: { companyId: this.companyId, email: args.email },
      select: { id: true, token: true },
    });

    if (existing) {
      await this.prisma.inviteToken.update({
        where: { id: existing.id, companyId: this.companyId },
        data: { expiresAt: args.expiresAt, createdById: this.userId },
      });

      return existing.token;
    }

    const created = await this.prisma.inviteToken.create({
      data: {
        token: args.token,
        email: args.email,
        expiresAt: args.expiresAt,
        companyId: this.companyId,
        createdById: this.userId,
      },
      select: { token: true },
    });

    return created.token;
  }

  async findPendingInvitations(): Promise<PendingInvitationDto[]> {
    const rows = await this.prisma.inviteToken.findMany({
      where: { companyId: this.companyId, email: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, email: true, updatedAt: true, expiresAt: true },
    });
    const invitations = rows.flatMap((row) =>
      row.email ? [{ id: row.id, email: row.email, sentAt: row.updatedAt, expiresAt: row.expiresAt }] : [],
    );
    if (invitations.length === 0) return [];

    const members = await this.prisma.user.findMany({
      where: {
        companyId: this.companyId,
        email: { in: invitations.map((invitation) => invitation.email), mode: "insensitive" },
      },
      select: { email: true },
    });
    const joined = new Set(members.map((member) => member.email.toLowerCase()));

    return invitations.filter((invitation) => !joined.has(invitation.email.toLowerCase()));
  }

  async findEmailInvitation(id: string): Promise<EmailInvitation | null> {
    const row = await this.prisma.inviteToken.findFirst({
      where: { id, companyId: this.companyId, email: { not: null } },
      select: { id: true, email: true },
    });

    return row?.email ? { id: row.id, email: row.email } : null;
  }

  async deleteEmailInvitation(id: string): Promise<void> {
    await this.prisma.inviteToken.deleteMany({ where: { id, companyId: this.companyId, email: { not: null } } });
  }
}
