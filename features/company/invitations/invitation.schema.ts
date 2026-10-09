import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const EMAIL_INVITATION_EXPIRY_DAYS = 7;

export const PendingInvitationDtoSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  sentAt: z.date(),
  expiresAt: z.date(),
});
export type PendingInvitationDto = Data<typeof PendingInvitationDtoSchema>;

export const InvitationIdSchema = z.object({ id: z.uuid() });
export type InvitationIdData = Data<typeof InvitationIdSchema>;
