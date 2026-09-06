import { describe, expect, it } from "vitest";

import type { ImapHostRejectionReason } from "../imap-host-guard";
import { checkImapHost, checkResolvedImapAddress, isAllowedImapHost } from "../imap-host-guard";

function reasonFor(host: string): ImapHostRejectionReason | undefined {
  const check = checkImapHost(host);

  return check.allowed ? undefined : check.reason;
}

function reasonsFor(hosts: string[]): Record<string, ImapHostRejectionReason | undefined> {
  return Object.fromEntries(hosts.map((host) => [host, reasonFor(host)]));
}

function expectAllReject(hosts: string[], reason: ImapHostRejectionReason) {
  expect(reasonsFor(hosts)).toEqual(Object.fromEntries(hosts.map((host) => [host, reason])));
}

describe("checkImapHost", () => {
  it("accepts the public IMAP hostnames tenants actually configure", () => {
    const hosts = ["imap.gmail.com", "outlook.office365.com", "imap.mail.yahoo.com", "imap.fastmail.com"];

    for (const host of hosts) expect(checkImapHost(host)).toEqual({ allowed: true, host, kind: "hostname" });
  });

  it("accepts a public hostname whatever its case, and with a trailing root dot", () => {
    expect(checkImapHost("IMAP.GMAIL.COM")).toEqual({ allowed: true, host: "IMAP.GMAIL.COM", kind: "hostname" });
    expect(checkImapHost("imap.gmail.com.")).toEqual({ allowed: true, host: "imap.gmail.com.", kind: "hostname" });
  });

  it("accepts an internationalised hostname in its punycode form", () => {
    expect(checkImapHost("imap.xn--tckwe.com")).toEqual({
      allowed: true,
      host: "imap.xn--tckwe.com",
      kind: "hostname",
    });
  });

  it("accepts ordinary public IPv4 literals", () => {
    const hosts = ["8.8.8.8", "1.1.1.1", "52.96.40.242", "216.239.32.10"];

    for (const host of hosts) expect(checkImapHost(host)).toEqual({ allowed: true, host, kind: "ipv4" });
  });

  it("accepts ordinary public IPv6 literals, compressed or written out in full", () => {
    const hosts = ["2606:4700:4700::1111", "2a00:1450:4001:80e::200e", "2606:4700:4700:0:0:0:0:1111"];

    for (const host of hosts) expect(checkImapHost(host)).toEqual({ allowed: true, host, kind: "ipv6" });
  });

  it("accepts the public addresses that sit just outside each blocked range", () => {
    const hosts = [
      "9.255.255.255",
      "11.0.0.1",
      "126.255.255.255",
      "128.0.0.1",
      "172.15.255.255",
      "172.32.0.1",
      "192.167.255.255",
      "192.169.0.1",
      "169.253.255.255",
      "169.255.0.1",
      "100.63.255.255",
      "100.128.0.1",
      "223.255.255.255",
    ];

    expect(reasonsFor(hosts)).toEqual(Object.fromEntries(hosts.map((host) => [host, undefined])));
  });

  it("rejects loopback IPv4 anywhere in 127.0.0.0/8", () => {
    expectAllReject(["127.0.0.1", "127.0.0.2", "127.1.1.1", "127.255.255.254"], "loopbackAddress");
  });

  it("rejects the IPv6 loopback in every spelling", () => {
    expectAllReject(["::1", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0001"], "loopbackAddress");
  });

  it("rejects localhost and its usual aliases", () => {
    const hosts = [
      "localhost",
      "LOCALHOST",
      "localhost.",
      "localhost.localdomain",
      "localhost4.localdomain4",
      "localhost6",
      "ip6-localhost",
      "ip6-loopback",
      "api.localhost",
    ];

    expectAllReject(hosts, "loopbackAddress");
  });

  it("rejects private IPv4 in all three RFC 1918 ranges", () => {
    const hosts = ["10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.0.1", "192.168.255.255"];

    expectAllReject(hosts, "privateAddress");
  });

  it("rejects link-local IPv4, including the cloud metadata address", () => {
    expectAllReject(["169.254.0.1", "169.254.169.254", "169.254.255.255"], "linkLocalAddress");
  });

  it("rejects link-local IPv6 across fe80::/10", () => {
    expectAllReject(["fe80::", "fe80::1", "febf::1", "fe80::200:5eff:fe00:5213"], "linkLocalAddress");
  });

  it("rejects carrier-grade NAT space", () => {
    expectAllReject(["100.64.0.1", "100.100.100.100", "100.127.255.255"], "carrierGradeNatAddress");
  });

  it("rejects the unspecified address in both families", () => {
    expectAllReject(["0.0.0.0", "::", "0:0:0:0:0:0:0:0"], "unspecifiedAddress");
  });

  it("rejects the rest of 0.0.0.0/8 as reserved", () => {
    expectAllReject(["0.1.2.3", "0.255.255.255"], "reservedAddress");
  });

  it("rejects the limited broadcast address", () => {
    expect(reasonFor("255.255.255.255")).toBe("broadcastAddress");
  });

  it("rejects IPv6 unique-local addresses across fc00::/7", () => {
    expectAllReject(["fc00::1", "fd00::1", "fdff:ffff:ffff:ffff::1"], "uniqueLocalAddress");
  });

  it("rejects multicast in both families", () => {
    expectAllReject(["224.0.0.1", "239.255.255.250", "ff02::1", "ff05::1:3"], "multicastAddress");
  });

  it("rejects the remaining non-routable IPv4 blocks", () => {
    const hosts = [
      "240.0.0.1",
      "255.255.255.254",
      "192.0.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
    ];

    expectAllReject(hosts, "reservedAddress");
  });

  it("rejects deprecated site-local, documentation and Teredo IPv6 prefixes", () => {
    expectAllReject(["fec0::1", "2001:db8::1", "2001:0:1234::1", "100::1"], "reservedAddress");
  });

  it("rejects IPv4-mapped and IPv4-compatible IPv6 forms that decode to a blocked address", () => {
    expect(reasonsFor(["::ffff:127.0.0.1", "::ffff:7f00:1", "::127.0.0.1"])).toEqual({
      "::ffff:127.0.0.1": "loopbackAddress",
      "::ffff:7f00:1": "loopbackAddress",
      "::127.0.0.1": "loopbackAddress",
    });
    expect(reasonFor("::ffff:10.0.0.1")).toBe("privateAddress");
    expect(reasonFor("::ffff:169.254.169.254")).toBe("linkLocalAddress");
    expect(reasonFor("::ffff:192.168.1.1")).toBe("privateAddress");
  });

  it("rejects NAT64 and 6to4 forms that embed a blocked IPv4 address", () => {
    expect(reasonFor("64:ff9b::127.0.0.1")).toBe("loopbackAddress");
    expect(reasonFor("64:ff9b::a00:1")).toBe("privateAddress");
    expect(reasonFor("2002:7f00:1::")).toBe("loopbackAddress");
    expect(reasonFor("2002:a9fe:a9fe::")).toBe("linkLocalAddress");
  });

  it("rejects an IPv4-mapped form even when it decodes to a public address", () => {
    expect(reasonFor("::ffff:8.8.8.8")).toBe("embeddedIpv4Address");
  });

  it("rejects decimal, octal and hexadecimal integer spellings of a blocked IPv4 address", () => {
    expect(reasonsFor(["2130706433", "0x7f000001", "017700000001", "0177.0.0.1", "0x7f.0.0.1", "127.1"])).toEqual({
      "2130706433": "loopbackAddress",
      "0x7f000001": "loopbackAddress",
      "017700000001": "loopbackAddress",
      "0177.0.0.1": "loopbackAddress",
      "0x7f.0.0.1": "loopbackAddress",
      "127.1": "loopbackAddress",
    });
    expect(reasonFor("127.0.1")).toBe("loopbackAddress");
    expect(reasonFor("2852039166")).toBe("linkLocalAddress");
    expect(reasonFor("3232235777")).toBe("privateAddress");
    expect(reasonFor("167772161")).toBe("privateAddress");
  });

  it("rejects a non-canonical IPv4 spelling even when it decodes to a public address", () => {
    expectAllReject(["0x08080808", "010.0.0.1", "8.8.8.010", "134744072", "8.526344"], "ambiguousIpv4Spelling");
  });

  it("rejects a hexadecimal IPv4 part however many leading zeros pad it", () => {
    expect(
      reasonsFor(["127.0.0.0x000000001", "127.0.0.0x00000000000000001", "0x7f.0x000000000001", "0x000000007f.0.0.1"]),
    ).toEqual({
      "127.0.0.0x000000001": "loopbackAddress",
      "127.0.0.0x00000000000000001": "loopbackAddress",
      "0x7f.0x000000000001": "loopbackAddress",
      "0x000000007f.0.0.1": "loopbackAddress",
    });
    expect(reasonFor("169.254.169.0x00000000fe")).toBe("linkLocalAddress");
    expect(reasonFor("169.254.169.0X00000000FE")).toBe("linkLocalAddress");
    expect(reasonFor("10.0.0x0000000001")).toBe("privateAddress");
    expect(reasonFor("192.168.0x000000000101")).toBe("privateAddress");
    expect(reasonFor("172.16.0.0x0000000001")).toBe("privateAddress");
    expect(reasonFor("100.64.0.0x0000000001")).toBe("carrierGradeNatAddress");
    expect(reasonFor("0.0.0.0x000000001")).toBe("reservedAddress");
    expect(reasonFor("255.255.255.0x0000000ff")).toBe("broadcastAddress");
  });

  it("rejects an octal IPv4 part however many leading zeros pad it", () => {
    expect(reasonFor("127.0.0.0000000000001")).toBe("loopbackAddress");
    expect(reasonFor("0000000000000177.0.0.1")).toBe("loopbackAddress");
  });

  it("still rejects a numeric host whose value is out of range for its part count", () => {
    expectAllReject(["4294967296", "999999999999", "1.2.3.256", "1.2.65536"], "malformedHost");
  });

  it("rejects IPv6 forms inside the reserved 0000::/8 block", () => {
    expect(reasonFor("::ffff:0:127.0.0.1")).toBe("loopbackAddress");
    expect(reasonFor("::ffff:0:10.0.0.1")).toBe("privateAddress");
    expect(reasonFor("0:0:0:0:ffff:0:7f00:1")).toBe("loopbackAddress");
    expect(reasonFor("::ffff:0:169.254.169.254")).toBe("linkLocalAddress");
    expectAllReject(["64:ff9b:1::a00:1", "64:ff9b:1::127.0.0.1", "1::", "0:1::1"], "reservedAddress");
  });

  it("rejects an empty host", () => {
    expect(reasonFor("")).toBe("emptyHost");
  });

  it("rejects whitespace anywhere in the host", () => {
    expectAllReject(
      [" ", "\t", " imap.gmail.com", "imap.gmail.com ", "imap gmail.com", "imap.gmail.com\n"],
      "hostWhitespace",
    );
  });

  it("rejects embedded credentials and any bare at sign", () => {
    const hosts = ["user:pass@imap.gmail.com", "user@imap.gmail.com", "@imap.gmail.com", "imap.gmail.com@127.0.0.1"];

    expectAllReject(hosts, "hostCredentials");
  });

  it("rejects a port inside the host string", () => {
    expectAllReject(
      ["imap.gmail.com:993", "127.0.0.1:993", "[::1]:993", "[2606:4700:4700::1111]:993", "imap.gmail.com:"],
      "hostPort",
    );
  });

  it("rejects non-ASCII and unicode-confusable hostnames", () => {
    expectAllReject(["imap.exämple.com", "lосalhost", "imap.gmail.cоm", "１２７.0.0.1"], "nonAsciiHost");
  });

  it("rejects hostnames that are not syntactically valid", () => {
    const hosts = [
      "imap.gmail.com/path",
      "-imap.gmail.com",
      "imap-.gmail.com",
      "imap..gmail.com",
      ".",
      "imap_sync.gmail.com",
      "999999999999",
      "1.2.3.4.5",
      "imap.gmail.com]",
      "[::1",
    ];

    expectAllReject(hosts, "malformedHost");
  });

  it("rejects a label longer than 63 characters and a name longer than 253", () => {
    const longLabel = `${"a".repeat(64)}.example.com`;
    const longName = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(62)].join(".");
    const longestAllowedName = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(61)].join(".");

    expect(reasonFor(longLabel)).toBe("malformedHost");
    expect(reasonFor(longName)).toBe("malformedHost");
    expect(reasonFor(longestAllowedName)).toBeUndefined();
  });

  it("rejects single-label and special-use internal names", () => {
    const hosts = [
      "mailserver",
      "imap.internal",
      "metadata.google.internal",
      "printer.local",
      "host.lan",
      "box.home.arpa",
      "srv.corp",
      "imap.test",
      "imap.invalid",
    ];

    expectAllReject(hosts, "internalName");
  });

  it("classifies a bracketed IPv6 literal by its address rather than its brackets", () => {
    expect(reasonFor("[::1]")).toBe("loopbackAddress");
    expect(checkImapHost("[2606:4700:4700::1111]")).toEqual({
      allowed: true,
      host: "[2606:4700:4700::1111]",
      kind: "ipv6",
    });
  });

  it("rejects a scoped IPv6 literal, by its address when that is blocked and as malformed otherwise", () => {
    expect(reasonFor("fe80::1%eth0")).toBe("linkLocalAddress");
    expect(reasonFor("[fe80::1%eth0]")).toBe("linkLocalAddress");
    expect(reasonFor("2606:4700:4700::1111%eth0")).toBe("malformedHost");
  });

  it("accepts a trailing root dot on a public IPv4 literal", () => {
    expect(checkImapHost("1.1.1.1.")).toEqual({ allowed: true, host: "1.1.1.1.", kind: "ipv4" });
    expect(reasonFor("127.0.0.1.")).toBe("loopbackAddress");
  });
});

describe("isAllowedImapHost", () => {
  it("agrees with checkImapHost on public hosts and blocked hosts", () => {
    expect(isAllowedImapHost("imap.gmail.com")).toBe(true);
    expect(isAllowedImapHost("8.8.8.8")).toBe(true);
    expect(isAllowedImapHost("127.0.0.1")).toBe(false);
    expect(isAllowedImapHost("localhost")).toBe(false);
    expect(isAllowedImapHost("169.254.169.254")).toBe(false);
    expect(isAllowedImapHost("")).toBe(false);
  });
});

describe("checkResolvedImapAddress", () => {
  it("accepts the public address a resolver handed back", () => {
    expect(checkResolvedImapAddress("8.8.8.8")).toEqual({ allowed: true, host: "8.8.8.8", kind: "ipv4" });
    expect(checkResolvedImapAddress("2606:4700:4700::1111")).toEqual({
      allowed: true,
      host: "2606:4700:4700::1111",
      kind: "ipv6",
    });
  });

  it("rejects a resolved address that lands on internal infrastructure", () => {
    const blocked: [string, ImapHostRejectionReason][] = [
      ["127.0.0.1", "loopbackAddress"],
      ["::1", "loopbackAddress"],
      ["10.0.0.1", "privateAddress"],
      ["169.254.169.254", "linkLocalAddress"],
      ["::ffff:127.0.0.1", "loopbackAddress"],
      ["fd00::1", "uniqueLocalAddress"],
    ];

    for (const [address, reason] of blocked)
      expect(checkResolvedImapAddress(address)).toEqual({ allowed: false, reason });
  });

  it("accepts the IPv4-mapped form of a public address, which only a resolver produces", () => {
    expect(checkResolvedImapAddress("::ffff:8.8.8.8")).toEqual({
      allowed: true,
      host: "::ffff:8.8.8.8",
      kind: "ipv6",
    });
  });

  it("refuses a non-canonical IPv4 spelling, which no resolver ever hands back", () => {
    const spellings = ["0x08080808", "010.0.0.1", "8.526344", "134744072"];

    for (const spelling of spellings)
      expect(checkResolvedImapAddress(spelling)).toEqual({ allowed: false, reason: "ambiguousIpv4Spelling" });
  });

  it("refuses to treat a hostname as a resolved address, because a name check cannot survive DNS rebinding", () => {
    expect(checkImapHost("imap.gmail.com")).toEqual({ allowed: true, host: "imap.gmail.com", kind: "hostname" });
    expect(checkResolvedImapAddress("imap.gmail.com")).toEqual({ allowed: false, reason: "notAnIpAddress" });
  });
});
