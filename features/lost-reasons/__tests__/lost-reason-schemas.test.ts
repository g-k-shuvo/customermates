import { describe, it, expect } from "vitest";

import { LostReasonDtoSchema } from "../lost-reason.schema";
import { BaseCreateLostReasonSchema } from "../upsert/create-lost-reason-base.schema";
import { BaseUpdateLostReasonSchema } from "../upsert/update-lost-reason-base.schema";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

describe("BaseCreateLostReasonSchema", () => {
  it("accepts a name on its own and defaults the position", () => {
    const result = BaseCreateLostReasonSchema.safeParse({ name: "Price" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Price");
      expect(result.data.position).toBe(0);
    }
  });

  it("rejects a blank name", () => {
    const result = BaseCreateLostReasonSchema.safeParse({ name: "   " });

    expect(result.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const result = BaseCreateLostReasonSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a negative position", () => {
    const result = BaseCreateLostReasonSchema.safeParse({ name: "Price", position: -1 });

    expect(result.success).toBe(false);
  });
});

describe("BaseUpdateLostReasonSchema", () => {
  it("accepts an update with the id only", () => {
    const result = BaseUpdateLostReasonSchema.safeParse({ id: VALID_UUID });

    expect(result.success).toBe(true);
  });

  it("rejects a non uuid id", () => {
    const result = BaseUpdateLostReasonSchema.safeParse({ id: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("rejects a blank name when provided", () => {
    const result = BaseUpdateLostReasonSchema.safeParse({ id: VALID_UUID, name: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a negative position", () => {
    const result = BaseUpdateLostReasonSchema.safeParse({ id: VALID_UUID, position: -1 });

    expect(result.success).toBe(false);
  });

  it("keeps a Date sent across the server-action boundary", () => {
    const archivedAt = new Date("2026-01-01T00:00:00.000Z");
    const result = BaseUpdateLostReasonSchema.safeParse({ id: VALID_UUID, archivedAt });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.archivedAt).toEqual(archivedAt);
  });

  it("coerces an ISO string archivedAt into a Date", () => {
    const result = BaseUpdateLostReasonSchema.safeParse({ id: VALID_UUID, archivedAt: "2026-01-01T00:00:00.000Z" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.archivedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("accepts a null archivedAt so a reason can be restored", () => {
    const result = BaseUpdateLostReasonSchema.safeParse({ id: VALID_UUID, archivedAt: null });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.archivedAt).toBeNull();
  });
});

describe("LostReasonDtoSchema", () => {
  function makeDto(overrides: Record<string, unknown> = {}) {
    return {
      id: VALID_UUID,
      name: "Price",
      position: 0,
      archivedAt: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      ...overrides,
    };
  }

  it("parses a valid lost reason dto", () => {
    const result = LostReasonDtoSchema.safeParse(makeDto());

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.archivedAt).toBeNull();
  });

  it("parses an archived lost reason dto", () => {
    const archivedAt = new Date("2026-02-01");
    const result = LostReasonDtoSchema.safeParse(makeDto({ archivedAt }));

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.archivedAt).toEqual(archivedAt);
  });

  it("rejects a dto whose id is not a uuid", () => {
    const result = LostReasonDtoSchema.safeParse(makeDto({ id: "not-a-uuid" }));

    expect(result.success).toBe(false);
  });

  it("rejects a dto whose archivedAt is a string", () => {
    const result = LostReasonDtoSchema.safeParse(makeDto({ archivedAt: "2026-02-01" }));

    expect(result.success).toBe(false);
  });
});
