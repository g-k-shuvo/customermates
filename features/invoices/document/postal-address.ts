import { CountryCode } from "@/generated/prisma";

import { APP_LOCALES, formattingTagFor } from "@/i18n/locale-registry";

export type PostalAddress = {
  street: string | null;
  additional: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
};

const POSTAL_LINE = /^(?:([A-Z]{1,3})[-\s])?(\d{4,6}|[A-Z0-9]{2,4}\s?[A-Z0-9]{3})\s+(.+)$/;

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

let countryNames: Map<string, string> | undefined;

function countryByName(): Map<string, string> {
  if (countryNames) return countryNames;

  countryNames = new Map();
  for (const locale of APP_LOCALES) {
    const names = new Intl.DisplayNames([formattingTagFor(locale)], { type: "region" });
    for (const code of Object.values(CountryCode)) {
      const upper = code.toUpperCase();
      const name = names.of(upper);
      if (name) countryNames.set(fold(name), upper);
      countryNames.set(fold(upper), upper);
    }
  }

  return countryNames;
}

export function parsePostalAddress(text: string, fallbackCountry = "DE"): PostalAddress {
  const lines = text
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
  const names = countryByName();
  const last = lines.at(-1);
  const country = last ? names.get(fold(last)) : undefined;
  const body = country ? lines.slice(0, -1) : lines;
  const postalIndex = body.findLastIndex((line) => POSTAL_LINE.test(line));
  const match = postalIndex >= 0 ? POSTAL_LINE.exec(body[postalIndex]) : null;
  const before = postalIndex >= 0 ? body.slice(0, postalIndex) : body;
  const prefixCountry = match?.[1] ? names.get(fold(match[1])) : undefined;

  return {
    street: before[0] ?? null,
    additional: before.length > 1 ? before.slice(1).join(", ") : null,
    postalCode: match?.[2] ?? null,
    city: match?.[3] ?? null,
    countryCode: country ?? prefixCountry ?? fallbackCountry,
  };
}
