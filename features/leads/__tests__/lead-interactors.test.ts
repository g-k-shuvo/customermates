import { describe, expect, it, vi } from "vitest";

import { LeadStatus } from "@/generated/prisma";

import { BaseCreateLeadSchema } from "../upsert/create-lead-base.schema";
import { CreateManyLeadsSchema } from "../upsert/create-many-leads.interactor";
import { UpdateLeadSchema } from "../upsert/update-lead.interactor";
import { UpdateManyLeadsSchema } from "../upsert/update-many-leads.interactor";

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

describe("create many leads schema", () => {
  it("rejects an empty batch", () => {
    expect(CreateManyLeadsSchema.safeParse({ leads: [] }).success).toBe(false);
  });

  it("caps a batch at one hundred leads", () => {
    const leads = Array.from({ length: 101 }, () => ({ title }));

    expect(CreateManyLeadsSchema.safeParse({ leads }).success).toBe(false);
  });

  it("applies the single-lead defaults to every row", () => {
    const parsed = CreateManyLeadsSchema.parse({ leads: [{ title }, { title, status: LeadStatus.qualified }] });

    expect(parsed.leads[0].status).toBe(LeadStatus.new);
    expect(parsed.leads[1].status).toBe(LeadStatus.qualified);
  });
});

describe("update many leads schema", () => {
  it("requires an id on every row", () => {
    expect(UpdateManyLeadsSchema.safeParse({ leads: [{ title }] }).success).toBe(false);
  });

  it("accepts a partial row alongside a full one", () => {
    const parsed = UpdateManyLeadsSchema.safeParse({
      leads: [
        { id: "3f4a1a52-6d0e-4f6f-9c29-3f6f0f7f5a11", status: LeadStatus.qualified },
        { id: "5c1b2d63-7e1f-4a70-8d3a-4a7b1c8d9e22", title, value: 250 },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
