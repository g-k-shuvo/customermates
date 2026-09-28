import { DuplicateMatchKeyKind } from "@/generated/prisma";

import { emailDomain, isFreeMailDomain } from "@/features/webform/ingest/free-mail-domains";

export type MatchKey = { kind: DuplicateMatchKeyKind; value: string };

export type ContactMatchInput = {
  firstName: string;
  lastName: string;
  emails: readonly string[];
  phones: readonly string[];
  organizationIds: readonly string[];
};

const GENERIC_LOCAL_PARTS: ReadonlySet<string> = new Set([
  "admin",
  "billing",
  "contact",
  "hello",
  "hi",
  "info",
  "kontakt",
  "mail",
  "marketing",
  "noreply",
  "no-reply",
  "office",
  "sales",
  "service",
  "support",
  "team",
]);

const MIN_LOCAL_PART_LENGTH = 3;
const PHONE_SUFFIX_DIGITS = 7;

const TRANSLITERATIONS: ReadonlyArray<[RegExp, string]> = [
  [/ß/g, "ss"],
  [/æ/g, "ae"],
  [/œ/g, "oe"],
  [/ø/g, "o"],
  [/ł/g, "l"],
  [/đ/g, "d"],
  [/ı/g, "i"],
];

const SOUND_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/sch/g, "s"],
  [/ch/g, "k"],
  [/ph/g, "f"],
  [/ck/g, "k"],
  [/th/g, "t"],
  [/dt/g, "t"],
  [/qu/g, "kv"],
  [/gn/g, "n"],
  [/c/g, "k"],
  [/q/g, "k"],
  [/x/g, "ks"],
  [/z/g, "s"],
  [/v/g, "f"],
  [/w/g, "f"],
  [/j/g, "i"],
  [/y/g, "i"],
  [/p/g, "b"],
  [/d/g, "t"],
  [/g/g, "k"],
];

export function foldText(value: string): string {
  let folded = value.toLowerCase();
  for (const [pattern, replacement] of TRANSLITERATIONS) folded = folded.replace(pattern, replacement);

  return folded
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(firstName: string, lastName: string): string[] {
  return foldText(`${firstName} ${lastName}`)
    .split(" ")
    .filter((token) => token.length > 1);
}

function surname(lastName: string): string | null {
  const tokens = foldText(lastName).split(" ").filter(Boolean);

  return tokens.at(-1) ?? null;
}

export function soundSkeleton(token: string): string {
  let folded = token;
  for (const [pattern, replacement] of SOUND_FOLDS) folded = folded.replace(pattern, replacement);

  const [head, ...rest] = folded;
  const consonants = rest.join("").replace(/[aeiouh]/g, "");

  return `${head ?? ""}${consonants}`.replace(/(.)\1+/g, "$1");
}

function localPart(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;

  const local = email.slice(0, at).toLowerCase().split("+")[0];

  return local.length >= MIN_LOCAL_PART_LENGTH && !GENERIC_LOCAL_PARTS.has(local) ? local : null;
}

function phoneSuffix(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");

  return digits.length >= PHONE_SUFFIX_DIGITS ? digits.slice(-PHONE_SUFFIX_DIGITS) : null;
}

export function contactMatchKeys(input: ContactMatchInput): MatchKey[] {
  const keys = new Map<string, MatchKey>();
  const add = (kind: DuplicateMatchKeyKind, value: string | null) => {
    if (value) keys.set(`${kind}\u0000${value}`, { kind, value });
  };

  const tokens = nameTokens(input.firstName, input.lastName);
  const lastName = surname(input.lastName);

  if (tokens.length >= 2) {
    add(DuplicateMatchKeyKind.nameKey, [...tokens].sort().join(" "));
    add(DuplicateMatchKeyKind.nameSoundKey, tokens.map(soundSkeleton).sort().join(" "));
  }

  for (const email of input.emails) {
    add(DuplicateMatchKeyKind.emailLocalPart, localPart(email));

    const domain = emailDomain(email);
    if (domain && lastName && !isFreeMailDomain(domain))
      add(DuplicateMatchKeyKind.emailDomainSurname, `${domain}|${lastName}`);
  }

  for (const phone of input.phones) add(DuplicateMatchKeyKind.phoneLast7, phoneSuffix(phone));

  if (lastName) {
    for (const organizationId of input.organizationIds)
      add(DuplicateMatchKeyKind.organizationSurname, `${organizationId}|${lastName}`);
  }

  return [...keys.values()];
}

const LEGAL_FORM_TOKENS: ReadonlySet<string> = new Set([
  "ab",
  "ag",
  "and",
  "as",
  "bv",
  "co",
  "corp",
  "corporation",
  "gbr",
  "gmbh",
  "inc",
  "incorporated",
  "kg",
  "limited",
  "llc",
  "llp",
  "ltd",
  "mbh",
  "nv",
  "ohg",
  "oy",
  "plc",
  "sa",
  "sarl",
  "sas",
  "se",
  "spa",
  "srl",
  "the",
  "ug",
  "und",
]);

export type OrganizationMatchInput = { name: string; emailDomains: readonly string[] };

export function organizationMatchKeys(input: OrganizationMatchInput): MatchKey[] {
  const keys = new Map<string, MatchKey>();
  const add = (kind: DuplicateMatchKeyKind, value: string | null) => {
    if (value) keys.set(`${kind}\u0000${value}`, { kind, value });
  };

  const tokens = foldText(input.name)
    .split(" ")
    .filter((token) => token.length > 0 && !LEGAL_FORM_TOKENS.has(token));

  if (tokens.length > 0 && tokens.join("").length >= MIN_LOCAL_PART_LENGTH) {
    add(DuplicateMatchKeyKind.organizationNameKey, tokens.join(" "));
    add(DuplicateMatchKeyKind.organizationSoundKey, tokens.map(soundSkeleton).join(" "));
  }

  for (const domain of input.emailDomains) add(DuplicateMatchKeyKind.organizationDomain, domain);

  return [...keys.values()];
}
