import { describe, expect, it, vi } from "vitest";

import type { AddressLookup } from "../../sync/resolve-imap-address";
import type { BuiltReply } from "../build-reply";
import type { ReplyMailer } from "../send-reply.service";

import { MailboxTransportError, MailboxTransportFailure } from "../../sync/mailbox-transport";
import { SendReplyService } from "../send-reply.service";

const DELIVERY = {
  host: "smtp.mailhost.io",
  port: 587,
  secure: false,
  username: "max@vendor.example",
  secret: "app-password",
};

const IMAP = {
  host: "imap.mailhost.io",
  port: 993,
  secure: true,
  username: "max@vendor.example",
  secret: "app-password",
};

const REPLY: BuiltReply = {
  from: "Max <max@vendor.example>",
  to: ["anna@buyer.example"],
  cc: [],
  subject: "Re: Renewal",
  inReplyTo: "<root@buyer.example>",
  references: ["<root@buyer.example>"],
  text: "On it.",
};

function lookupReturning(...addresses: readonly { address: string; family: number }[]): AddressLookup {
  return vi.fn(() => Promise.resolve(addresses));
}

function serviceWith(options: { resolveAddresses?: AddressLookup; allowPrivateHosts?: boolean }) {
  const mailer = vi.fn<ReplyMailer>().mockResolvedValue({
    messageId: "<sent@vendor.example>",
    raw: Buffer.from(""),
    recipients: ["anna@buyer.example"],
  });
  const appendToSent = vi.fn().mockResolvedValue(undefined);

  return { service: new SendReplyService({ appendToSent } as never, mailer, options), mailer, appendToSent };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;

    return null;
  } catch (error) {
    return error instanceof MailboxTransportError ? error : null;
  }
}

describe("SendReplyService host pinning", () => {
  it("dials the resolved address and keeps the configured hostname for tls verification", async () => {
    const { service, mailer } = serviceWith({
      resolveAddresses: lookupReturning({ address: "93.184.216.34", family: 4 }),
    });

    await service.send(DELIVERY, REPLY, IMAP);

    expect(mailer).toHaveBeenCalledWith(
      expect.objectContaining({ host: "93.184.216.34", servername: "smtp.mailhost.io", port: 587 }),
      REPLY,
      expect.any(String),
    );
  });

  it("refuses an smtp host whose dns answer points back inside the network", async () => {
    const { service, mailer, appendToSent } = serviceWith({
      resolveAddresses: lookupReturning({ address: "127.0.0.1", family: 4 }),
    });

    const failure = await failureOf(service.send(DELIVERY, REPLY, IMAP));

    expect(failure?.failure).toBe(MailboxTransportFailure.hostRejected);
    expect(failure?.hostRejection).toBe("loopbackAddress");
    expect(mailer).not.toHaveBeenCalled();
    expect(appendToSent).not.toHaveBeenCalled();
  });

  it("refuses the cloud metadata address behind a public smtp name", async () => {
    const { service, mailer } = serviceWith({
      resolveAddresses: lookupReturning({ address: "169.254.169.254", family: 4 }),
    });

    const failure = await failureOf(service.send(DELIVERY, REPLY, IMAP));

    expect(failure?.hostRejection).toBe("linkLocalAddress");
    expect(mailer).not.toHaveBeenCalled();
  });

  it("refuses the whole answer when only one record is internal", async () => {
    const { service, mailer } = serviceWith({
      resolveAddresses: lookupReturning({ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }),
    });

    const failure = await failureOf(service.send(DELIVERY, REPLY, IMAP));

    expect(failure?.hostRejection).toBe("privateAddress");
    expect(mailer).not.toHaveBeenCalled();
  });

  it("refuses a private smtp literal without consulting dns", async () => {
    const resolveAddresses = vi.fn<AddressLookup>().mockResolvedValue([]);
    const { service, mailer } = serviceWith({ resolveAddresses });

    const failure = await failureOf(service.send({ ...DELIVERY, host: "192.168.1.10" }, REPLY, IMAP));

    expect(failure?.failure).toBe(MailboxTransportFailure.hostRejected);
    expect(resolveAddresses).not.toHaveBeenCalled();
    expect(mailer).not.toHaveBeenCalled();
  });

  it("resolves again on every send so a rebinding answer cannot be pinned once and reused", async () => {
    const resolveAddresses = vi
      .fn<AddressLookup>()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const { service, mailer } = serviceWith({ resolveAddresses });

    await service.send(DELIVERY, REPLY, IMAP);
    const failure = await failureOf(service.send(DELIVERY, REPLY, IMAP));

    expect(failure?.hostRejection).toBe("loopbackAddress");
    expect(mailer).toHaveBeenCalledOnce();
    expect(resolveAddresses).toHaveBeenCalledTimes(2);
  });

  it("dials a private host only when the environment allowed it for the whole instance", async () => {
    const { service, mailer } = serviceWith({ allowPrivateHosts: true });

    await service.send({ ...DELIVERY, host: "127.0.0.1" }, REPLY, IMAP);

    expect(mailer).toHaveBeenCalledWith(
      expect.objectContaining({ host: "127.0.0.1", servername: "127.0.0.1" }),
      REPLY,
      expect.any(String),
    );
  });
});
