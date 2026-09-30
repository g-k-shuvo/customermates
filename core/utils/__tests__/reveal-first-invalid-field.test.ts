import { afterEach, describe, expect, it, vi } from "vitest";

import { revealFirstInvalidField } from "../reveal-first-invalid-field";

function stubPage(field: { scrollIntoView: () => void; focus: () => void } | null) {
  const querySelector = vi.fn(() => field);
  vi.stubGlobal("window", { requestAnimationFrame: (callback: () => void) => callback() });
  vi.stubGlobal("document", { querySelector });
  return querySelector;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("revealFirstInvalidField", () => {
  it("scrolls the first invalid field into view and focuses it", () => {
    const field = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const querySelector = stubPage(field);

    revealFirstInvalidField();

    expect(querySelector).toHaveBeenCalledWith('[aria-invalid="true"]');
    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(field.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does nothing when no field is invalid", () => {
    stubPage(null);

    expect(() => revealFirstInvalidField()).not.toThrow();
  });
});
