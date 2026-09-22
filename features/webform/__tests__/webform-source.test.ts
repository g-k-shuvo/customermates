import { describe, expect, it } from "vitest";

import { CreateWebFormSourceSchema } from "../upsert/create-web-form-source.interactor";
import { WEBFORM_SLUG_PATTERN } from "../webform-source.schema";

const base = { name: "Request a Call", slug: "request-a-call" };

describe("web form source slug", () => {
  it("accepts a lowercase hyphenated slug", () => {
    expect(WEBFORM_SLUG_PATTERN.test("request-a-call")).toBe(true);
    expect(WEBFORM_SLUG_PATTERN.test("ebitda2024")).toBe(true);
  });

  it("rejects shapes that would not survive a url", () => {
    for (const slug of ["Request A Call", "request_a_call", "-leading", "trailing-", "double--hyphen", "has/slash", ""])
      expect(WEBFORM_SLUG_PATTERN.test(slug), slug).toBe(false);
  });
});

describe("create web form source schema", () => {
  it("defaults an unspecified source to active with no mapping", () => {
    const parsed = CreateWebFormSourceSchema.parse(base);

    expect(parsed.active).toBe(true);
    expect(parsed.defaultLabels).toEqual([]);
    expect(parsed.fieldMapping).toEqual({});
  });

  it("rejects a slug the endpoint could not route", () => {
    expect(CreateWebFormSourceSchema.safeParse({ ...base, slug: "Request A Call" }).success).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(CreateWebFormSourceSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });

  it("keeps a configured field mapping", () => {
    const parsed = CreateWebFormSourceSchema.parse({
      ...base,
      fieldMapping: { email: "fields.email", titleTemplate: "{{organizationName}} — {{form_title}}" },
    });

    expect(parsed.fieldMapping.email).toBe("fields.email");
    expect(parsed.fieldMapping.titleTemplate).toContain("form_title");
  });

  it("drops mapping keys it does not know", () => {
    const parsed = CreateWebFormSourceSchema.parse({
      ...base,
      fieldMapping: { email: "fields.email", nonsense: "fields.nonsense" },
    });

    expect("nonsense" in parsed.fieldMapping).toBe(false);
  });
});
