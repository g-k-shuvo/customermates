import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import { DEAL_WRITABLE_FIELDS, RECORD_WRITABLE_FIELDS, resolveFieldWrite } from "../run/automation-field-writes";

const lead = RECORD_WRITABLE_FIELDS[EntityType.lead];

describe("resolveFieldWrite", () => {
  it("refuses fields that are not on the allowlist, including prototype keys", () => {
    for (const field of ["companyId", "constructor", "toString", "__proto__", "hasOwnProperty"])
      expect(resolveFieldWrite(DEAL_WRITABLE_FIELDS, field, "x")).toEqual({ ok: false, error: "fieldNotWritable" });
  });

  it("refuses the contact and organization fields that have no column", () => {
    expect(resolveFieldWrite(RECORD_WRITABLE_FIELDS[EntityType.contact], "jobTitle", "CTO")).toEqual({
      ok: false,
      error: "fieldNotWritable",
    });
    expect(resolveFieldWrite(RECORD_WRITABLE_FIELDS[EntityType.organization], "website", "https://a.test")).toEqual({
      ok: false,
      error: "fieldNotWritable",
    });
  });

  it("refuses a record type that has no writable fields", () => {
    expect(resolveFieldWrite(RECORD_WRITABLE_FIELDS[EntityType.service], "name", "x")).toEqual({
      ok: false,
      error: "fieldNotWritable",
    });
  });

  it("refuses a blank value instead of writing zero or an empty name", () => {
    expect(resolveFieldWrite(DEAL_WRITABLE_FIELDS, "probability", "")).toEqual({
      ok: false,
      error: "fieldValueMissing",
    });
    expect(resolveFieldWrite(DEAL_WRITABLE_FIELDS, "probability", "   ")).toEqual({
      ok: false,
      error: "fieldValueMissing",
    });
    expect(resolveFieldWrite(lead, "title", " ")).toEqual({ ok: false, error: "fieldValueMissing" });
  });

  it("refuses null for a column that cannot be empty, and clears one that can", () => {
    expect(resolveFieldWrite(lead, "title", null)).toEqual({ ok: false, error: "fieldValueMissing" });
    expect(resolveFieldWrite(lead, "status", null)).toEqual({ ok: false, error: "fieldValueMissing" });
    expect(resolveFieldWrite(lead, "value", null)).toEqual({ ok: true, field: "value", value: null });
  });

  it("coerces numbers given as text and refuses what is not a number", () => {
    expect(resolveFieldWrite(DEAL_WRITABLE_FIELDS, "probability", " 50 ")).toEqual({
      ok: true,
      field: "probability",
      value: 50,
    });
    expect(resolveFieldWrite(lead, "value", "quite a lot")).toEqual({ ok: false, error: "fieldValueInvalid" });
    expect(resolveFieldWrite(lead, "value", true)).toEqual({ ok: false, error: "fieldValueInvalid" });
  });

  it("accepts only real lead statuses, not keys inherited by every object", () => {
    expect(resolveFieldWrite(lead, "status", "qualified")).toEqual({ ok: true, field: "status", value: "qualified" });

    for (const value of ["constructor", "toString", "valueOf", "__proto__", "Qualified"])
      expect(resolveFieldWrite(lead, "status", value)).toEqual({ ok: false, error: "fieldValueInvalid" });
  });

  it("parses dates and refuses what is not one", () => {
    const resolved = resolveFieldWrite(DEAL_WRITABLE_FIELDS, "expectedCloseDate", "2026-10-01");

    expect(resolved.ok && resolved.value instanceof Date ? resolved.value.toISOString() : null).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(resolveFieldWrite(DEAL_WRITABLE_FIELDS, "expectedCloseDate", "next week")).toEqual({
      ok: false,
      error: "fieldValueInvalid",
    });
  });
});
