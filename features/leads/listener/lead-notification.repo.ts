import type { Locale } from "@/generated/prisma";

export type LeadNotificationRecipient = {
  email: string;
  displayLanguage: Locale;
};

export abstract class LeadNotificationRepo {
  abstract findLeadOwnerCompanyWide(leadId: string): Promise<LeadNotificationRecipient | null>;
}
