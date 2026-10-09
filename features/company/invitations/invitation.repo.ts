import type { PendingInvitationDto } from "./invitation.schema";

export type EmailInvitation = { id: string; email: string };

export abstract class IssueEmailInvitationRepo {
  abstract issueEmailInviteToken(args: { email: string; token: string; expiresAt: Date }): Promise<string>;
}

export abstract class PendingInvitationsRepo {
  abstract findPendingInvitations(): Promise<PendingInvitationDto[]>;
}

export abstract class ManageInvitationRepo {
  abstract findEmailInvitation(id: string): Promise<EmailInvitation | null>;
  abstract deleteEmailInvitation(id: string): Promise<void>;
}
