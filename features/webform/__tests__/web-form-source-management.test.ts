import { describe, expect, it, vi } from "vitest";

import { UpdateWebFormSourceSchema } from "../upsert/update-web-form-source.interactor";
import { DeleteWebFormSourceSchema } from "../delete/delete-web-form-source.interactor";

vi.mock("@/core/di", () => ({}));

const id = "3f4a1a52-6d0e-4f6f-9c29-3f6f0f7f5a11";

describe("update web form source schema", () => {
  it("accepts an id on its own, so a caller may send only the fields it changes", () => {
    expect(UpdateWebFormSourceSchema.safeParse({ id }).success).toBe(true);
  });

  it("does not accept a slug, because a live form already posts to the current one", () => {
    const parsed = UpdateWebFormSourceSchema.parse({ id, slug: "renamed-form" });

    expect("slug" in parsed).toBe(false);
  });

  it("rejects a blank name rather than clearing it", () => {
    expect(UpdateWebFormSourceSchema.safeParse({ id, name: "   " }).success).toBe(false);
  });

  it("allows the default owner to be cleared", () => {
    expect(UpdateWebFormSourceSchema.safeParse({ id, defaultOwnerId: null }).success).toBe(true);
  });

  it("rejects a blank default label", () => {
    expect(UpdateWebFormSourceSchema.safeParse({ id, defaultLabels: ["good", "  "] }).success).toBe(false);
  });

  it("drops mapping keys it does not know", () => {
    const parsed = UpdateWebFormSourceSchema.parse({
      id,
      fieldMapping: { email: "fields.email", nonsense: "fields.nonsense" },
    });

    expect(parsed.fieldMapping && "nonsense" in parsed.fieldMapping).toBe(false);
  });
});

describe("delete web form source schema", () => {
  it("requires a uuid", () => {
    expect(DeleteWebFormSourceSchema.safeParse({ id }).success).toBe(true);
    expect(DeleteWebFormSourceSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});
