import { describe, expect, it, vi } from "vitest";

import { MailboxTransportError, MailboxTransportFailure } from "../mailbox-transport";
import { pinImapTarget, type AddressLookup } from "../resolve-imap-address";

function lookupReturning(...addresses: readonly { address: string; family: number }[]): AddressLookup {
  return vi.fn(() => Promise.resolve(addresses));
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof MailboxTransportError ? error : null;
  }
}

describe("pinImapTarget", () => {
  it("pins the resolved address and keeps the hostname for tls verification", async () => {
    const target = await pinImapTarget("imap.gmail.com", lookupReturning({ address: "142.250.185.109", family: 4 }));

    expect(target).toEqual({ address: "142.250.185.109", family: 4, servername: "imap.gmail.com" });
  });

  it("rejects a hostname the guard refuses without ever resolving it", async () => {
    const resolveAddresses = vi.fn(() => Promise.resolve([{ address: "8.8.8.8", family: 4 }]));

    const failure = await failureOf(pinImapTarget("localhost", resolveAddresses));

    expect(failure?.failure).toBe(MailboxTransportFailure.hostRejected);
    expect(resolveAddresses).not.toHaveBeenCalled();
  });

  it("rejects a public name that resolves to a private address", async () => {
    const failure = await failureOf(
      pinImapTarget("imap.attacker-mail.net", lookupReturning({ address: "10.0.0.5", family: 4 })),
    );

    expect(failure?.failure).toBe(MailboxTransportFailure.hostRejected);
    expect(failure?.hostRejection).toBe("privateAddress");
  });

  it("rejects a public name that resolves to the cloud metadata address", async () => {
    const failure = await failureOf(
      pinImapTarget("imap.attacker-mail.net", lookupReturning({ address: "169.254.169.254", family: 4 })),
    );

    expect(failure?.hostRejection).toBe("linkLocalAddress");
  });

  it("refuses the whole answer when only one record is internal", async () => {
    const failure = await failureOf(
      pinImapTarget(
        "imap.attacker-mail.net",
        lookupReturning({ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }),
      ),
    );

    expect(failure?.failure).toBe(MailboxTransportFailure.hostRejected);
    expect(failure?.hostRejection).toBe("loopbackAddress");
  });

  it("rejects a loopback IPv6 record hidden behind a public name", async () => {
    const failure = await failureOf(
      pinImapTarget("imap.attacker-mail.net", lookupReturning({ address: "::1", family: 6 })),
    );

    expect(failure?.hostRejection).toBe("loopbackAddress");
  });

  it("reports an empty answer as unresolvable rather than allowing it", async () => {
    const failure = await failureOf(pinImapTarget("imap.nowhere-mail.net", lookupReturning()));

    expect(failure?.failure).toBe(MailboxTransportFailure.unresolvableHost);
  });

  it("reports a failing resolver as unresolvable", async () => {
    const failure = await failureOf(
      pinImapTarget("imap.nowhere-mail.net", () => Promise.reject(new Error("ENOTFOUND"))),
    );

    expect(failure?.failure).toBe(MailboxTransportFailure.unresolvableHost);
  });

  it("accepts a public ip literal without consulting dns", async () => {
    const resolveAddresses = vi.fn(() => Promise.resolve([]));

    const target = await pinImapTarget("93.184.216.34", resolveAddresses);

    expect(target.address).toBe("93.184.216.34");
    expect(resolveAddresses).not.toHaveBeenCalled();
  });

  it("rejects a private ip literal without consulting dns", async () => {
    const resolveAddresses = vi.fn(() => Promise.resolve([]));

    const failure = await failureOf(pinImapTarget("192.168.1.10", resolveAddresses));

    expect(failure?.failure).toBe(MailboxTransportFailure.hostRejected);
    expect(resolveAddresses).not.toHaveBeenCalled();
  });

  it("resolves each connection attempt so a pinned target is never reused across calls", async () => {
    const resolveAddresses = vi
      .fn<AddressLookup>()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    const first = await pinImapTarget("imap.attacker-mail.net", resolveAddresses);
    expect(first.address).toBe("93.184.216.34");

    const failure = await failureOf(pinImapTarget("imap.attacker-mail.net", resolveAddresses));
    expect(failure?.hostRejection).toBe("loopbackAddress");
    expect(resolveAddresses).toHaveBeenCalledTimes(2);
  });
});
