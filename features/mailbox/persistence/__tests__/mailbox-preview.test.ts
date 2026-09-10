import { describe, expect, it } from "vitest";

import { toThreadPreview } from "../thread-preview";

describe("mailbox thread previews", () => {
  it("drops a javascript link target mailparser rendered into the text body", () => {
    expect(toThreadPreview("Invoice 8842 is overdue. pay now [javascript:alert(1)]")).toBe(
      "Invoice 8842 is overdue. pay now",
    );
  });

  it("keeps an ordinary http link target", () => {
    expect(toThreadPreview("See [https://example.com/invoice]")).toBe("See [https://example.com/invoice]");
  });

  it("keeps mailto and tel targets", () => {
    expect(toThreadPreview("Call [tel:+441234] or write [mailto:a@b.c]")).toBe(
      "Call [tel:+441234] or write [mailto:a@b.c]",
    );
  });

  it("drops data and vbscript targets", () => {
    expect(toThreadPreview("x [data:text/html;base64,AAA] y [vbscript:msgbox]")).toBe("x y");
  });

  it("returns null for a body that is only an unsafe target", () => {
    expect(toThreadPreview("[javascript:alert(1)]")).toBeNull();
  });
});
