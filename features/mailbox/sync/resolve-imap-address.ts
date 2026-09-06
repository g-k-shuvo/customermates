import { lookup } from "node:dns/promises";

import { checkImapHost, checkResolvedImapAddress } from "./imap-host-guard";
import { MailboxTransportError, MailboxTransportFailure } from "./mailbox-transport";

export type ResolvedAddress = { address: string; family: number };

export type AddressLookup = (host: string) => Promise<readonly ResolvedAddress[]>;

export type PinnedImapTarget = {
  address: string;
  family: number;
  servername: string;
};

const nodeLookup: AddressLookup = async (host) => {
  const resolved = await lookup(host, { all: true, verbatim: true });

  return resolved.map((entry) => ({ address: entry.address, family: entry.family }));
};

export async function pinImapTarget(
  host: string,
  resolveAddresses: AddressLookup = nodeLookup,
): Promise<PinnedImapTarget> {
  const named = checkImapHost(host);
  if (!named.allowed) throw new MailboxTransportError(MailboxTransportFailure.hostRejected, named.reason);

  if (named.kind !== "hostname")
    return { address: named.host, family: named.kind === "ipv6" ? 6 : 4, servername: host };

  let resolved: readonly ResolvedAddress[];
  try {
    resolved = await resolveAddresses(host);
  } catch {
    throw new MailboxTransportError(MailboxTransportFailure.unresolvableHost);
  }

  if (resolved.length === 0) throw new MailboxTransportError(MailboxTransportFailure.unresolvableHost);

  for (const entry of resolved) {
    const checked = checkResolvedImapAddress(entry.address);
    if (!checked.allowed) throw new MailboxTransportError(MailboxTransportFailure.hostRejected, checked.reason);
  }

  const [first] = resolved;

  return { address: first.address, family: first.family, servername: host };
}
