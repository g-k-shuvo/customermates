import type { Locale } from "@/generated/prisma";
import type { MergeRecordRef } from "../render/merge-values.repo";

export type RecipientUser = { id: string; email: string; displayLanguage: Locale | null };

export abstract class MessageRecipientRepo {
  abstract findActingUser(): Promise<RecipientUser | null>;
  abstract findRecordOwner(record: MergeRecordRef): Promise<RecipientUser | null>;
}
