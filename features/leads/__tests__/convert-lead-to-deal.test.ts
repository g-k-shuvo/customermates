import { describe, expect, it, vi } from "vitest";

import { ConvertLeadToDealSchema } from "../convert/convert-lead-to-deal.interactor";

vi.mock("@/core/di", () => ({}));

const id = "3f4a1a52-6d0e-4f6f-9c29-3f6f0f7f5a11";

describe("convert lead to deal schema", () => {
  it("needs only the lead id, so the deal inherits the lead's title", () => {
    const parsed = ConvertLeadToDealSchema.safeParse({ id });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.name).toBeUndefined();
  });

  it("rejects a blank override name rather than creating an unnamed deal", () => {
    expect(ConvertLeadToDealSchema.safeParse({ id, name: "   " }).success).toBe(false);
  });

  it("accepts an explicit placement", () => {
    const parsed = ConvertLeadToDealSchema.safeParse({
      id,
      pipelineId: "5c1b2d63-7e1f-4a70-8d3a-4a7b1c8d9e22",
      stageId: "7a2c3e84-8f20-4b81-9e4b-5b8c2d9e0f33",
      probability: 40,
    });

    expect(parsed.success).toBe(true);
  });

  it("keeps probability inside the percentage range the deal model uses", () => {
    expect(ConvertLeadToDealSchema.safeParse({ id, probability: 101 }).success).toBe(false);
    expect(ConvertLeadToDealSchema.safeParse({ id, probability: -1 }).success).toBe(false);
  });

  it("rejects a non-uuid lead id", () => {
    expect(ConvertLeadToDealSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});
