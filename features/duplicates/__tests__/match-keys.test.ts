import { describe, expect, it } from "vitest";

import { DuplicateMatchKeyKind } from "@/generated/prisma";

import { contactMatchKeys, foldText, organizationMatchKeys, soundSkeleton } from "../match-keys";

const person = (overrides: Partial<Parameters<typeof contactMatchKeys>[0]> = {}) =>
  contactMatchKeys({
    firstName: "Jürgen",
    lastName: "Müller",
    emails: [],
    phones: [],
    organizationIds: [],
    ...overrides,
  });

const valuesOf = (keys: ReturnType<typeof contactMatchKeys>, kind: DuplicateMatchKeyKind) =>
  keys.filter((key) => key.kind === kind).map((key) => key.value);

describe("contact match keys", () => {
  it("folds accents and German, French and Italian spellings onto one name key", () => {
    expect(foldText("Jürgen Müller-Straße")).toBe("jurgen muller strasse");
    expect(valuesOf(person(), DuplicateMatchKeyKind.nameKey)).toEqual(["jurgen muller"]);
    expect(valuesOf(person({ firstName: "Muller", lastName: "Jurgen" }), DuplicateMatchKeyKind.nameKey)).toEqual([
      "jurgen muller",
    ]);
  });

  it("gives spelling variants the same sound key but keeps different names apart", () => {
    expect(soundSkeleton("schmidt")).toBe(soundSkeleton("schmitt"));
    expect(soundSkeleton("meyer")).toBe(soundSkeleton("maier"));
    expect(soundSkeleton("philipp")).toBe(soundSkeleton("filip"));
    expect(soundSkeleton("schmidt")).not.toBe(soundSkeleton("schneider"));
  });

  it("needs a first and a last name before it emits a name key", () => {
    expect(valuesOf(person({ firstName: "", lastName: "Müller" }), DuplicateMatchKeyKind.nameKey)).toEqual([]);
  });

  it("keys the email local part without plus tags and skips role addresses", () => {
    const keys = person({ emails: ["J.Mueller+crm@acme.de", "info@acme.de"] });

    expect(valuesOf(keys, DuplicateMatchKeyKind.emailLocalPart)).toEqual(["j.mueller"]);
  });

  it("pairs a company domain with the surname, but never a free-mail domain", () => {
    const keys = person({ emails: ["jm@acme.de", "jm@gmail.com"] });

    expect(valuesOf(keys, DuplicateMatchKeyKind.emailDomainSurname)).toEqual(["acme.de|muller"]);
  });

  it("keys the last seven digits of a phone whatever its formatting", () => {
    expect(
      valuesOf(person({ phones: ["+49 30 1234567", "030/123-4567", "12345"] }), DuplicateMatchKeyKind.phoneLast7),
    ).toEqual(["1234567"]);
  });

  it("keys each organization with the surname", () => {
    expect(valuesOf(person({ organizationIds: ["org-1"] }), DuplicateMatchKeyKind.organizationSurname)).toEqual([
      "org-1|muller",
    ]);
  });
});

describe("organization match keys", () => {
  const valuesFor = (name: string, emailDomains: string[] = []) => organizationMatchKeys({ name, emailDomains });

  it("drops legal forms and folds spelling, so Acme GmbH and ACME match", () => {
    expect(valuesOf(valuesFor("Acme GmbH"), DuplicateMatchKeyKind.organizationNameKey)).toEqual(["acme"]);
    expect(valuesOf(valuesFor("ACME"), DuplicateMatchKeyKind.organizationNameKey)).toEqual(["acme"]);
    expect(valuesOf(valuesFor("Müller & Söhne KG"), DuplicateMatchKeyKind.organizationNameKey)).toEqual([
      "muller sohne",
    ]);
  });

  it("emits no name key for a name that is only a legal form", () => {
    expect(valuesOf(valuesFor("GmbH"), DuplicateMatchKeyKind.organizationNameKey)).toEqual([]);
  });

  it("keys each company email domain of the organization's contacts", () => {
    expect(valuesOf(valuesFor("Acme", ["acme.de"]), DuplicateMatchKeyKind.organizationDomain)).toEqual(["acme.de"]);
  });
});
