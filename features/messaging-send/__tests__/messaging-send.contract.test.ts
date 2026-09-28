import { describe, expect, it } from "vitest";

import {
  SUPPRESSION_BATCH_LIMIT,
  chunkForSuppression,
  dedupeKeyFor,
  idempotencyKeyFor,
} from "../messaging-send.contract";

describe("messaging-send contract", () => {
  it("gives one recipient of one source occurrence one dedupe key, whatever the address casing", () => {
    const key = dedupeKeyFor({
      source: "automation",
      sourceId: "run-1",
      recipient: "Anna@Buyer.example",
      occurrence: "step-2",
    });

    expect(key).toBe(
      dedupeKeyFor({
        source: "automation",
        sourceId: "run-1",
        recipient: " anna@buyer.example ",
        occurrence: "step-2",
      }),
    );
    expect(key).toMatch(/^automation:[0-9a-f]{40}$/);
  });

  it("separates sources, occurrences and recipients", () => {
    const base = { source: "campaign" as const, sourceId: "c-1", recipient: "a@x.example" };
    const keys = new Set([
      dedupeKeyFor(base),
      dedupeKeyFor({ ...base, source: "automation" }),
      dedupeKeyFor({ ...base, occurrence: "resend" }),
      dedupeKeyFor({ ...base, recipient: "b@x.example" }),
      dedupeKeyFor({ ...base, sourceId: "c-2" }),
    ]);

    expect(keys.size).toBe(5);
  });

  it("derives a stable idempotency key per attempt", () => {
    const key = dedupeKeyFor({ source: "manual", sourceId: "m-1", recipient: "a@x.example" });

    expect(idempotencyKeyFor(key, "1")).toBe(idempotencyKeyFor(key, "1"));
    expect(idempotencyKeyFor(key, "1")).not.toBe(idempotencyKeyFor(key, "2"));
  });

  it("batches suppression lookups at the registry's limit", () => {
    const addresses = Array.from({ length: 250 }, (_, index) => `r${index}@x.example`);
    const chunks = chunkForSuppression(addresses);

    expect(chunks.map((chunk) => chunk.length)).toEqual([SUPPRESSION_BATCH_LIMIT, SUPPRESSION_BATCH_LIMIT, 50]);
    expect(chunks.flat()).toEqual(addresses);
  });
});
