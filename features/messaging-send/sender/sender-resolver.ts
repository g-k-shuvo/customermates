import type { SenderIdentityRepo, SenderIdentityRow } from "./sender-identity.repo";

import { resolveTxt } from "node:dns/promises";

export const SENDER_UNVERIFIED = "senderUnverified";
export const VERIFICATION_RECORD_PREFIX = "_crm-verify";

export type ResolvedSender =
  | { ok: true; from?: string; replyTo?: string }
  | { ok: false; code: typeof SENDER_UNVERIFIED };

export type TxtLookup = (name: string) => Promise<string[][]>;

export function domainOf(address: string): string {
  return (address.split("@")[1] ?? "").trim().toLowerCase();
}

export function verificationRecordName(domain: string): string {
  return `${VERIFICATION_RECORD_PREFIX}.${domain}`;
}

export function verificationRecordValue(token: string): string {
  return `crm-verify=${token}`;
}

export function isVerified(identity: SenderIdentityRow): boolean {
  return identity.verifiedAt !== null && identity.verifiedDomain === domainOf(identity.fromAddress);
}

const mailbox = (name: string, address: string) => {
  const cleaned = name.replace(/["<>\r\n]/g, "").trim();

  return cleaned ? `"${cleaned}" <${address}>` : address;
};

export async function domainHasToken(domain: string, token: string, lookup: TxtLookup = resolveTxt): Promise<boolean> {
  const records = await lookup(verificationRecordName(domain)).catch(() => [] as string[][]);

  return records.some((chunks) => chunks.join("").trim() === verificationRecordValue(token));
}

export class SenderResolver {
  constructor(private repo: SenderIdentityRepo) {}

  async resolve(senderUserId: string | null): Promise<ResolvedSender> {
    const identity = await this.repo.findIdentityOrNull();
    if (!identity) return { ok: true };
    if (!isVerified(identity)) return { ok: false, code: SENDER_UNVERIFIED };

    if (identity.allowUserSenders && senderUserId) {
      const user = await this.repo.findUserOrNull(senderUserId);
      if (user && domainOf(user.email) === identity.verifiedDomain) {
        const email = user.email.toLowerCase();

        return { ok: true, from: mailbox(`${user.firstName} ${user.lastName}`, email), replyTo: email };
      }
    }

    return {
      ok: true,
      from: mailbox(identity.fromName, identity.fromAddress.toLowerCase()),
      ...(identity.replyTo ? { replyTo: identity.replyTo } : {}),
    };
  }
}
