import { describe, expect, it } from "vitest";

import { searchTermVariants } from "../search-term-variants";

describe("searchTermVariants", () => {
  it("finds an umlaut name typed without the umlaut", () => {
    expect(searchTermVariants("Muller")).toEqual(expect.arrayContaining(["muller", "müller", "mueller"]));
  });

  it("treats the ue transliteration and the umlaut as the same letter", () => {
    expect(searchTermVariants("mueller")).toEqual(expect.arrayContaining(["müller", "muller"]));
    expect(searchTermVariants("Müller")).toEqual(expect.arrayContaining(["mueller", "muller"]));
  });

  it("matches ss and ß both ways", () => {
    expect(searchTermVariants("strasse")).toContain("straße");
    expect(searchTermVariants("Straße")).toContain("strasse");
  });

  it("expands every vowel of a double-barrelled name", () => {
    expect(searchTermVariants("schulz-muller")).toContain("schulz-müller");
  });

  it("caps the number of variants for long terms", () => {
    expect(searchTermVariants("aouaouaouaou").length).toBeLessThanOrEqual(28);
  });

  it("leaves short terms alone", () => {
    expect(searchTermVariants("Ab")).toEqual(["Ab"]);
  });

  it("returns a term without vowels unchanged", () => {
    expect(searchTermVariants("xyz")).toEqual(["xyz"]);
  });
});
