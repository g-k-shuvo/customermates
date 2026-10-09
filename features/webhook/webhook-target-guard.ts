import type { AddressLookup } from "@/features/mailbox/sync/resolve-imap-address";

import { checkImapHost } from "@/features/mailbox/sync/imap-host-guard";
import { MailboxTransportError, MailboxTransportFailure } from "@/features/mailbox/sync/mailbox-transport";
import { pinImapTarget } from "@/features/mailbox/sync/resolve-imap-address";

export type WebhookTargetOptions = { allowPrivateHosts?: boolean; resolveAddresses?: AddressLookup };

export type WebhookTargetVerdict = "allowed" | "refused" | "unresolvable";

export const WEBHOOK_PRIVATE_TARGET_MESSAGE =
  "The URL points to a private or internal address, which this installation does not allow";

function hostOf(url: string): string | null {
  try {
    const { hostname } = new URL(url);

    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  } catch {
    return null;
  }
}

export function isPublicWebhookUrl(url: string, options: WebhookTargetOptions = {}): boolean {
  if (options.allowPrivateHosts) return true;

  const host = hostOf(url);

  return host !== null && checkImapHost(host).allowed;
}

export async function checkWebhookTarget(
  url: string,
  options: WebhookTargetOptions = {},
): Promise<WebhookTargetVerdict> {
  if (options.allowPrivateHosts) return "allowed";

  const host = hostOf(url);
  if (host === null) return "refused";

  try {
    await pinImapTarget(host, options.resolveAddresses);

    return "allowed";
  } catch (error) {
    if (error instanceof MailboxTransportError && error.failure === MailboxTransportFailure.unresolvableHost)
      return "unresolvable";

    return "refused";
  }
}
