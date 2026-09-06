export type ImapHostRejectionReason =
  | "emptyHost"
  | "hostWhitespace"
  | "hostCredentials"
  | "hostPort"
  | "nonAsciiHost"
  | "malformedHost"
  | "internalName"
  | "loopbackAddress"
  | "privateAddress"
  | "linkLocalAddress"
  | "carrierGradeNatAddress"
  | "uniqueLocalAddress"
  | "multicastAddress"
  | "broadcastAddress"
  | "unspecifiedAddress"
  | "reservedAddress"
  | "ambiguousIpv4Spelling"
  | "embeddedIpv4Address"
  | "notAnIpAddress";

export type ImapHostTargetKind = "hostname" | "ipv4" | "ipv6";

export type ImapHostCheck =
  | { allowed: true; host: string; kind: ImapHostTargetKind }
  | { allowed: false; reason: ImapHostRejectionReason };

export function checkImapHost(host: string): ImapHostCheck {
  const inspected = inspectImapHost(host);
  if ("rejection" in inspected) return { allowed: false, reason: inspected.rejection };
  if (inspected.nonCanonicalSpelling) return { allowed: false, reason: inspected.nonCanonicalSpelling };

  return { allowed: true, host, kind: inspected.kind };
}

export function isAllowedImapHost(host: string): boolean {
  return checkImapHost(host).allowed;
}

export function checkResolvedImapAddress(address: string): ImapHostCheck {
  const inspected = inspectImapHost(address);
  if ("rejection" in inspected) return { allowed: false, reason: inspected.rejection };
  if (inspected.kind === "hostname") return { allowed: false, reason: "notAnIpAddress" };
  if (inspected.nonCanonicalSpelling === "ambiguousIpv4Spelling")
    return { allowed: false, reason: inspected.nonCanonicalSpelling };

  return { allowed: true, host: address, kind: inspected.kind };
}

type InspectedImapHost =
  | { rejection: ImapHostRejectionReason }
  | { kind: ImapHostTargetKind; nonCanonicalSpelling: ImapHostRejectionReason | undefined };

type DecodedIpv4 = { bytes: number[]; canonical: boolean };

const WHITESPACE = /\s/u;
const PORT_SUFFIX = /^[^:]*:[0-9]*$/;
const ALL_DIGITS = /^[0-9]+$/;
const DECIMAL_PART = /^[0-9]+$/;
const OCTAL_PART = /^0[0-7]+$/;
const HEX_PART = /^0[xX][0-9a-fA-F]+$/;
const IPV6_GROUP = /^[0-9a-fA-F]{1,4}$/;
const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAXIMUM_HOSTNAME_LENGTH = 253;

const LOOPBACK_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "localhost4",
  "localhost4.localdomain4",
  "localhost6",
  "localhost6.localdomain6",
  "ip6-localhost",
  "ip6-loopback",
]);

const INTERNAL_TOP_LEVEL_NAMES = new Set([
  "alt",
  "arpa",
  "corp",
  "example",
  "home",
  "internal",
  "intranet",
  "invalid",
  "lan",
  "local",
  "localdomain",
  "onion",
  "private",
  "test",
]);

function inspectImapHost(host: string): InspectedImapHost {
  if (host.length === 0) return { rejection: "emptyHost" };
  if (WHITESPACE.test(host)) return { rejection: "hostWhitespace" };

  const unsupportedCharacter = characterSetRejection(host);
  if (unsupportedCharacter) return { rejection: unsupportedCharacter };
  if (host.includes("@")) return { rejection: "hostCredentials" };
  if (host.startsWith("[")) return inspectBracketedHost(host);

  const withoutRootDot = host.length > 1 && host.endsWith(".") ? host.slice(0, -1) : host;
  if (withoutRootDot.includes(":")) return inspectColonHost(withoutRootDot);

  const decoded = decodeIpv4(withoutRootDot);
  if (decoded) return inspectIpv4(decoded);

  return inspectHostname(withoutRootDot);
}

function characterSetRejection(host: string): ImapHostRejectionReason | undefined {
  for (const character of host) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint > 0x7f) return "nonAsciiHost";
    if (codePoint < 0x21 || codePoint === 0x7f) return "malformedHost";
  }

  return undefined;
}

function inspectBracketedHost(host: string): InspectedImapHost {
  const closingIndex = host.indexOf("]");
  if (closingIndex === -1) return { rejection: "malformedHost" };

  const suffix = host.slice(closingIndex + 1);
  if (suffix.startsWith(":")) return { rejection: "hostPort" };
  if (suffix.length > 0) return { rejection: "malformedHost" };

  return inspectColonHost(host.slice(1, closingIndex));
}

function inspectColonHost(value: string): InspectedImapHost {
  const zoneIndex = value.indexOf("%");
  const bytes = decodeIpv6(zoneIndex === -1 ? value : value.slice(0, zoneIndex));
  if (!bytes) return { rejection: PORT_SUFFIX.test(value) ? "hostPort" : "malformedHost" };

  const inspected = inspectIpv6(bytes);
  if (zoneIndex === -1 || "rejection" in inspected) return inspected;

  return { rejection: "malformedHost" };
}

function inspectIpv4(decoded: DecodedIpv4): InspectedImapHost {
  const rejection = ipv4Rejection(decoded.bytes);
  if (rejection) return { rejection };
  if (!decoded.canonical) return { kind: "ipv4", nonCanonicalSpelling: "ambiguousIpv4Spelling" };

  return { kind: "ipv4", nonCanonicalSpelling: undefined };
}

function inspectIpv6(bytes: number[]): InspectedImapHost {
  const embedded = embeddedIpv4(bytes);
  if (embedded) return inspectEmbeddedIpv4(embedded);

  const rejection = ipv6Rejection(bytes);
  if (rejection) return { rejection };

  return { kind: "ipv6", nonCanonicalSpelling: undefined };
}

function inspectEmbeddedIpv4(bytes: number[]): InspectedImapHost {
  const rejection = ipv4Rejection(bytes);
  if (rejection) return { rejection };

  return { kind: "ipv6", nonCanonicalSpelling: "embeddedIpv4Address" };
}

function inspectHostname(value: string): InspectedImapHost {
  const name = value.toLowerCase();
  if (name.length > MAXIMUM_HOSTNAME_LENGTH) return { rejection: "malformedHost" };

  const labels = name.split(".");
  if (labels.some((label) => !HOSTNAME_LABEL.test(label))) return { rejection: "malformedHost" };

  const topLevelName = labels[labels.length - 1];
  if (ALL_DIGITS.test(topLevelName)) return { rejection: "malformedHost" };
  if (LOOPBACK_NAMES.has(name) || topLevelName === "localhost") return { rejection: "loopbackAddress" };
  if (labels.length < 2) return { rejection: "internalName" };
  if (INTERNAL_TOP_LEVEL_NAMES.has(topLevelName)) return { rejection: "internalName" };

  return { kind: "hostname", nonCanonicalSpelling: undefined };
}

function ipv4Rejection(bytes: number[]): ImapHostRejectionReason | undefined {
  const [first, second, third, fourth] = bytes;
  if (first === 0 && second === 0 && third === 0 && fourth === 0) return "unspecifiedAddress";
  if (first === 0) return "reservedAddress";
  if (first === 127) return "loopbackAddress";
  if (first === 10) return "privateAddress";
  if (first === 172 && second >= 16 && second <= 31) return "privateAddress";
  if (first === 192 && second === 168) return "privateAddress";
  if (first === 169 && second === 254) return "linkLocalAddress";
  if (first === 100 && second >= 64 && second <= 127) return "carrierGradeNatAddress";
  if (first === 255 && second === 255 && third === 255 && fourth === 255) return "broadcastAddress";
  if (first >= 224 && first <= 239) return "multicastAddress";
  if (first >= 240) return "reservedAddress";
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return "reservedAddress";
  if (first === 198 && (second === 18 || second === 19)) return "reservedAddress";
  if (first === 198 && second === 51 && third === 100) return "reservedAddress";
  if (first === 203 && second === 0 && third === 113) return "reservedAddress";

  return undefined;
}

function ipv6Rejection(bytes: number[]): ImapHostRejectionReason | undefined {
  if (isUnspecifiedIpv6(bytes)) return "unspecifiedAddress";
  if (isLoopbackIpv6(bytes)) return "loopbackAddress";

  const [first, second] = bytes;
  if ((first & 0xfe) === 0xfc) return "uniqueLocalAddress";
  if (first === 0xfe && (second & 0xc0) === 0x80) return "linkLocalAddress";
  if (first === 0xfe) return "reservedAddress";
  if (first === 0xff) return "multicastAddress";
  if (first === 0x00) return "reservedAddress";
  if (hasPrefix(bytes, [0x20, 0x01, 0x0d, 0xb8])) return "reservedAddress";
  if (hasPrefix(bytes, [0x20, 0x01, 0x00, 0x00])) return "reservedAddress";
  if (hasPrefix(bytes, [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])) return "reservedAddress";

  return undefined;
}

function embeddedIpv4(bytes: number[]): number[] | undefined {
  if (isUnspecifiedIpv6(bytes) || isLoopbackIpv6(bytes)) return undefined;
  if (hasPrefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff])) return bytes.slice(12);
  if (hasPrefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0])) return bytes.slice(12);
  if (hasPrefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])) return bytes.slice(12);
  if (hasPrefix(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0])) return bytes.slice(12);
  if (hasPrefix(bytes, [0x20, 0x02])) return bytes.slice(2, 6);

  return undefined;
}

function isUnspecifiedIpv6(bytes: number[]): boolean {
  return bytes.every((byte) => byte === 0);
}

function isLoopbackIpv6(bytes: number[]): boolean {
  return hasPrefix(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) && bytes[15] === 1;
}

function hasPrefix(bytes: number[], prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function decodeIpv4(value: string): DecodedIpv4 | undefined {
  const parts = value.split(".");
  if (parts.length > 4) return undefined;

  const numbers: number[] = [];
  for (const part of parts) {
    const decodedPart = decodeIpv4Part(part);
    if (decodedPart === undefined) return undefined;
    numbers.push(decodedPart);
  }

  const leading = numbers.slice(0, -1);
  if (leading.some((leadingValue) => leadingValue > 0xff)) return undefined;

  const trailing = numbers[numbers.length - 1];
  if (trailing >= 2 ** (8 * (5 - parts.length))) return undefined;

  let total = trailing;
  for (let index = 0; index < leading.length; index += 1) total += leading[index] * 2 ** (8 * (3 - index));

  const bytes = [
    Math.floor(total / 0x1000000) % 0x100,
    Math.floor(total / 0x10000) % 0x100,
    Math.floor(total / 0x100) % 0x100,
    total % 0x100,
  ];

  return { bytes, canonical: parts.length === 4 && parts.every(isCanonicalIpv4Part) };
}

function decodeIpv4Part(part: string): number | undefined {
  if (HEX_PART.test(part)) return Number.parseInt(part.slice(2), 16);
  if (OCTAL_PART.test(part)) return Number.parseInt(part.slice(1), 8);
  if (DECIMAL_PART.test(part)) return Number.parseInt(part, 10);

  return undefined;
}

function isCanonicalIpv4Part(part: string): boolean {
  if (!DECIMAL_PART.test(part)) return false;
  if (part.length > 1 && part.startsWith("0")) return false;

  return part.length <= 3;
}

function decodeIpv6(value: string): number[] | undefined {
  if (!value.includes(":")) return undefined;

  const sides = value.split("::");
  if (sides.length > 2) return undefined;

  const compressed = sides.length === 2;
  const headTokens = sides[0] === "" ? [] : sides[0].split(":");
  const tailTokens = !compressed || sides[1] === "" ? [] : sides[1].split(":");
  const split = splitEmbeddedIpv4(compressed ? tailTokens : headTokens);
  if (!split) return undefined;

  const headGroups = decodeIpv6Groups(compressed ? headTokens : split.groups);
  const tailGroups = decodeIpv6Groups(compressed ? split.groups : []);
  if (!headGroups || !tailGroups) return undefined;

  const occupied = headGroups.length + tailGroups.length + (split.embedded ? 2 : 0);
  if (compressed ? occupied > 7 : occupied !== 8) return undefined;

  const zeros = Array.from({ length: 8 - occupied }, () => 0);
  const groups = [...headGroups, ...zeros, ...tailGroups];
  const bytes: number[] = [];
  for (const group of groups) bytes.push(Math.floor(group / 0x100), group % 0x100);
  if (split.embedded) bytes.push(...split.embedded);

  return bytes;
}

function decodeIpv6Groups(tokens: string[]): number[] | undefined {
  const groups: number[] = [];
  for (const token of tokens) {
    if (!IPV6_GROUP.test(token)) return undefined;
    groups.push(Number.parseInt(token, 16));
  }

  return groups;
}

function splitEmbeddedIpv4(tokens: string[]): { groups: string[]; embedded: number[] | undefined } | undefined {
  const last = tokens.at(-1);
  if (last === undefined || !last.includes(".")) return { groups: tokens, embedded: undefined };

  const decoded = decodeIpv4(last);
  if (!decoded?.canonical) return undefined;

  return { groups: tokens.slice(0, -1), embedded: decoded.bytes };
}
