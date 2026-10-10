import { describe, expect, it } from "vitest";

import { compactPhoneList, compactPhoneNumber } from "../phone-number";

describe("compactPhoneNumber", () => {
  it("drops the spaces, dashes, dots, slashes and brackets people type", () => {
    expect(compactPhoneNumber(" +49 (30) 123-45/67.8 ")).toBe("+493012345678");
  });

  it("turns a 00 international prefix into +", () => {
    expect(compactPhoneNumber("0049 30 1234567")).toBe("+49301234567");
  });

  it("leaves a number without a country code without one", () => {
    expect(compactPhoneNumber("(555) 555-5555")).toBe("5555555555");
  });
});

describe("compactPhoneList", () => {
  it("compacts every number of a multi-value field and drops empty entries", () => {
    expect(compactPhoneList("+49 30 1234567, , 0044 20 7946 0000")).toBe("+49301234567,+442079460000");
  });
});
