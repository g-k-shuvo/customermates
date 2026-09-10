import { describe, it, expect } from "vitest";

import { BaseCreateDealSchema } from "../upsert/create-deal-base.schema";
import { BaseUpdateDealSchema } from "../upsert/update-deal-base.schema";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";

describe("BaseCreateDealSchema", () => {
  it("accepts valid minimal data", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "Enterprise Deal",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Enterprise Deal");
      expect(result.data.organizationIds).toEqual([]);
      expect(result.data.userIds).toEqual([]);
      expect(result.data.contactIds).toEqual([]);
      expect(result.data.services).toEqual([]);
      expect(result.data.customFieldValues).toEqual([]);
    }
  });

  it("accepts full data with services", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "Big Deal",
      notes: "Important deal",
      organizationIds: [VALID_UUID],
      contactIds: [VALID_UUID],
      userIds: [VALID_UUID],
      services: [{ serviceId: VALID_UUID, quantity: 5 }],
      customFieldValues: [{ columnId: VALID_UUID, value: "high" }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.services[0].quantity).toBe(5);
  });

  it("defaults service quantity to 1", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "Deal",
      services: [{ serviceId: VALID_UUID }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.services[0].quantity).toBe(1);
  });

  it("accepts an iso expectedCloseDate and coerces it to a Date", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "Deal",
      expectedCloseDate: "2026-05-01T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expectedCloseDate?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  it("accepts a date-only expectedCloseDate and an offset one", () => {
    expect(BaseCreateDealSchema.safeParse({ name: "Deal", expectedCloseDate: "2026-05-01" }).success).toBe(true);
    expect(
      BaseCreateDealSchema.safeParse({ name: "Deal", expectedCloseDate: "2026-05-01T10:00:00+02:00" }).success,
    ).toBe(true);
  });

  it("still accepts a Date so a re-parsed payload stays valid", () => {
    const once = BaseCreateDealSchema.parse({ name: "Deal", expectedCloseDate: "2026-05-01T10:00:00.000Z" });
    const twice = BaseCreateDealSchema.safeParse(once);
    expect(twice.success).toBe(true);
    if (twice.success) expect(twice.data.expectedCloseDate?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  it("rejects an expectedCloseDate that is not iso-8601", () => {
    expect(BaseCreateDealSchema.safeParse({ name: "Deal", expectedCloseDate: "May 1, 2026" }).success).toBe(false);
    expect(BaseCreateDealSchema.safeParse({ name: "Deal", expectedCloseDate: 1767225600000 }).success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = BaseCreateDealSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects negative service quantity", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "Deal",
      services: [{ serviceId: VALID_UUID, quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid serviceId UUID", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "Deal",
      services: [{ serviceId: "not-uuid" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero quantity for services", () => {
    const result = BaseCreateDealSchema.safeParse({
      name: "Deal",
      services: [{ serviceId: VALID_UUID, quantity: 0 }],
    });
    expect(result.success).toBe(true);
  });
});

describe("BaseUpdateDealSchema", () => {
  it("accepts valid update with id only", () => {
    const result = BaseUpdateDealSchema.safeParse({
      id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial name update", () => {
    const result = BaseUpdateDealSchema.safeParse({
      id: VALID_UUID,
      name: "Updated Deal",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const result = BaseUpdateDealSchema.safeParse({
      name: "Updated",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null for nullable array fields", () => {
    const result = BaseUpdateDealSchema.safeParse({
      id: VALID_UUID,
      organizationIds: null,
      contactIds: null,
      userIds: null,
      services: null,
      customFieldValues: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts services update with quantities", () => {
    const result = BaseUpdateDealSchema.safeParse({
      id: VALID_UUID,
      services: [{ serviceId: VALID_UUID, quantity: 3 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an iso expectedCloseDate, a null one and a re-parsed Date", () => {
    expect(BaseUpdateDealSchema.safeParse({ id: VALID_UUID, expectedCloseDate: null }).success).toBe(true);

    const once = BaseUpdateDealSchema.parse({ id: VALID_UUID, expectedCloseDate: "2026-05-01T10:00:00.000Z" });
    expect(once.expectedCloseDate?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
    expect(BaseUpdateDealSchema.safeParse(once).success).toBe(true);
  });

  it("rejects an expectedCloseDate that is not iso-8601", () => {
    expect(BaseUpdateDealSchema.safeParse({ id: VALID_UUID, expectedCloseDate: "next friday" }).success).toBe(false);
  });

  it("rejects empty name when provided", () => {
    const result = BaseUpdateDealSchema.safeParse({
      id: VALID_UUID,
      name: "",
    });
    expect(result.success).toBe(false);
  });
});
