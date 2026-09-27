import { describe, expect, it } from "vitest";

import { organizationEmailDomains } from "../organization-email-domains";

describe("organizationEmailDomains", () => {
  it("keeps each company domain once, lower-cased and sorted", () => {
    expect(
      organizationEmailDomains([
        "Anna@Buyer.Example",
        "bob@buyer.example",
        "cara@sub.buyer.example",
        "dan@alpha.example",
      ]),
    ).toEqual(["alpha.example", "buyer.example", "sub.buyer.example"]);
  });

  it("drops free-mail providers, malformed addresses and dotless hosts", () => {
    expect(organizationEmailDomains(["x@gmail.com", "y@GMX.de", "no-at-sign", "trailing@", "z@localhost"])).toEqual([]);
  });
});
