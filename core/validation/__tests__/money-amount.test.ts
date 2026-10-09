import { describe, expect, it } from "vitest";

import { BaseCreateDealSchema } from "@/features/deals/upsert/create-deal-base.schema";
import { BaseUpdateDealSchema } from "@/features/deals/upsert/update-deal-base.schema";
import { BaseCreateServiceSchema } from "@/features/services/upsert/create-service-base.schema";
import { BaseCreateLeadSchema } from "@/features/leads/upsert/create-lead-base.schema";

const ID = "00000000-0000-4000-8000-000000000001";
const TYPO = 99_999_999_999_999_999_999;

describe("money amounts are capped below a billion", () => {
  it("accepts the largest amount on deals, services and leads", () => {
    expect(BaseCreateDealSchema.safeParse({ name: "Deal", baseValue: 999_999_999.99 }).success).toBe(true);
    expect(BaseCreateServiceSchema.safeParse({ name: "Service", amount: 999_999_999.99 }).success).toBe(true);
    expect(BaseCreateLeadSchema.safeParse({ title: "Lead", value: 999_999_999.99 }).success).toBe(true);
  });

  it("refuses a typo that would be rounded and skew every total", () => {
    expect(BaseCreateDealSchema.safeParse({ name: "Deal", baseValue: TYPO }).success).toBe(false);
    expect(BaseUpdateDealSchema.safeParse({ id: ID, baseValue: TYPO }).success).toBe(false);
    expect(BaseCreateServiceSchema.safeParse({ name: "Service", amount: TYPO }).success).toBe(false);
    expect(BaseCreateLeadSchema.safeParse({ title: "Lead", value: TYPO }).success).toBe(false);
  });

  it("refuses an infinite amount", () => {
    expect(BaseCreateDealSchema.safeParse({ name: "Deal", baseValue: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});
