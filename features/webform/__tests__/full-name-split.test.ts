import { describe, expect, it, vi } from "vitest";

import { mapWebFormFields, splitFullName } from "../ingest/field-mapping";

vi.mock("@/core/di", () => ({}));

describe("splitting a single full-name field", () => {
  it("splits on the first space, so the surname keeps its particles", () => {
    expect(splitFullName("Ada van der Berg", null)).toEqual(["Ada", "van der Berg"]);
  });

  it("handles the ordinary two-word case", () => {
    expect(splitFullName("Grace Hopper", null)).toEqual(["Grace", "Hopper"]);
  });

  it("leaves a single word alone rather than inventing a surname", () => {
    expect(splitFullName("Prince", null)).toEqual(["Prince", null]);
  });

  it("does not touch a name the form already split", () => {
    expect(splitFullName("Grace", "Hopper")).toEqual(["Grace", "Hopper"]);
  });

  it("treats a whitespace-only last name as absent", () => {
    expect(splitFullName("Grace Hopper", "   ")).toEqual(["Grace", "Hopper"]);
  });

  it("passes through when there is no name at all", () => {
    expect(splitFullName(null, null)).toEqual([null, null]);
    expect(splitFullName("", null)).toEqual(["", null]);
  });

  it("collapses the run of whitespace between the parts", () => {
    expect(splitFullName("Grace    Hopper", null)).toEqual(["Grace", "Hopper"]);
  });
});

describe("mapping a Fluent Forms payload with one name field", () => {
  it("produces a first and last name from names.first_name alone", () => {
    const payload = {
      fields: { names: { first_name: "Grace Hopper" }, email: "grace@computingpioneers.test" },
    };

    const mapped = mapWebFormFields(payload, {
      firstName: "fields.names.first_name",
      lastName: "fields.names.last_name",
      email: "fields.email",
    });

    expect(mapped.firstName).toBe("Grace");
    expect(mapped.lastName).toBe("Hopper");
    expect(mapped.email).toBe("grace@computingpioneers.test");
  });

  it("respects a form that supplies both parts", () => {
    const payload = { fields: { names: { first_name: "Grace", last_name: "Hopper" } } };

    const mapped = mapWebFormFields(payload, {
      firstName: "fields.names.first_name",
      lastName: "fields.names.last_name",
    });

    expect(mapped.firstName).toBe("Grace");
    expect(mapped.lastName).toBe("Hopper");
  });
});
