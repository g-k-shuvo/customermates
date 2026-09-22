import { describe, expect, it, vi } from "vitest";

import { LeadStatus } from "@/generated/prisma";

import { BaseCreateLeadSchema } from "../upsert/create-lead-base.schema";
import { GetLeadsSchema } from "../get/get-leads.interactor";
import { UpdateLeadSchema } from "../upsert/update-lead.interactor";

vi.mock("@/core/di", () => ({}));

const title = "Request a call from the footer form";

describe("create lead schema", () => {
  it("defaults a new lead to the new status and a manual origin", () => {
    const parsed = BaseCreateLeadSchema.parse({ title });

    expect(parsed.status).toBe(LeadStatus.new);
    expect(parsed.sourceOrigin).toBe("manual");
    expect(parsed.labels).toEqual([]);
  });

  it("rejects a blank title", () => {
    expect(BaseCreateLeadSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(BaseCreateLeadSchema.safeParse({ title, value: -1 }).success).toBe(false);
  });

  it("accepts every lead status", () => {
    for (const status of Object.values(LeadStatus))
      expect(BaseCreateLeadSchema.safeParse({ title, status }).success).toBe(true);
  });
});

describe("update lead schema", () => {
  it("requires an id", () => {
    expect(UpdateLeadSchema.safeParse({ title }).success).toBe(false);
  });

  it("accepts a partial update", () => {
    const parsed = UpdateLeadSchema.safeParse({
      id: "3f4a1a52-6d0e-4f6f-9c29-3f6f0f7f5a11",
      status: LeadStatus.qualified,
    });

    expect(parsed.success).toBe(true);
  });
});

describe("get leads schema", () => {
  it("defaults the page window", () => {
    const parsed = GetLeadsSchema.parse({});

    expect(parsed.skip).toBe(0);
    expect(parsed.take).toBe(50);
  });

  it("caps the page size", () => {
    expect(GetLeadsSchema.safeParse({ take: 500 }).success).toBe(false);
  });
});
