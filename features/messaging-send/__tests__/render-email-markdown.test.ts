import { describe, expect, it } from "vitest";

import { MERGE_FIELDS, UNMERGEABLE_FIELDS } from "../render/merge-fields";
import { EmailImageUrlSchema, emailBannerHtml, renderEmailMarkdown } from "../render/render-email-markdown";

const VALUES = {
  "contact.firstName": "Anna",
  "organization.name": "Müller & Söhne",
  "sender.fullName": "Max Bergmann",
};

describe("email markdown rendering", () => {
  it("renders markdown to inline-styled, email-safe HTML and a plain-text copy", () => {
    const result = renderEmailMarkdown({
      subject: "Hello {{ contact.firstName }}",
      markdown: "Hi **{{contact.firstName}}**,\n\nSee [our offer](https://example.com/offer).\n\n- one\n- two",
      values: VALUES,
    });
    if (!result.ok) throw new Error(result.failure.code);

    expect(result.email.subject).toBe("Hello Anna");
    expect(result.email.html).toContain('<p style="margin:0 0 16px;');
    expect(result.email.html).toContain("<strong>Anna</strong>");
    expect(result.email.html).toContain('href="https://example.com/offer"');
    expect(result.email.html).toContain('target="_blank"');
    expect(result.email.html).toContain("<ul style=");
    expect(result.email.text).toContain("See our offer (https://example.com/offer).");
    expect(result.email.text).toContain("Hi Anna,");
  });

  it("never lets raw HTML, scripts or unsafe links through", () => {
    const result = renderEmailMarkdown({
      subject: "Hi",
      markdown: '<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) <b style="x">b</b>',
      values: {},
    });
    if (!result.ok) throw new Error(result.failure.code);

    expect(result.email.html).not.toMatch(/<script|<img|<a |<b |href="javascript/);
    expect(result.email.html).toContain("&lt;script&gt;");
  });

  it("escapes merged values instead of rendering them as markdown or HTML", () => {
    const result = renderEmailMarkdown({
      subject: "For {{organization.name}}",
      markdown: "Dear {{ contact.firstName }} at {{organization.name}}",
      values: { ...VALUES, "contact.firstName": "<img src=x> [click](https://evil.example) **bold**" },
    });
    if (!result.ok) throw new Error(result.failure.code);

    expect(result.email.html).toContain("&lt;img src=x&gt; [click](https://evil.example) **bold**");
    expect(result.email.html).toContain("Müller &amp; Söhne");
    expect(result.email.html).not.toContain("<img");
    expect(result.email.html).not.toContain('href="https://evil.example"');
    expect(result.email.subject).toBe("For Müller & Söhne");
  });

  it("uses a declared default when a value is missing and fails without one", () => {
    const withDefault = renderEmailMarkdown({
      subject: "x",
      markdown: 'Hi {{ contact.lastName | "there" }},',
      values: {},
    });
    const withoutDefault = renderEmailMarkdown({ subject: "x", markdown: "Hi {{ contact.lastName }},", values: {} });

    expect(withDefault.ok && withDefault.email.text).toBe("Hi there,");
    expect(withoutDefault).toEqual({ ok: false, failure: { code: "missingMergeValue", field: "contact.lastName" } });
  });

  it("refuses an unknown, a sensitive or a malformed field rather than passing it through", () => {
    expect(renderEmailMarkdown({ subject: "x", markdown: "{{ contact.nickname }}", values: {} })).toEqual({
      ok: false,
      failure: { code: "unknownMergeField", field: "contact.nickname" },
    });
    expect(renderEmailMarkdown({ subject: "x", markdown: "{{contact.notes}}", values: {} })).toMatchObject({
      ok: false,
      failure: { code: "unknownMergeField" },
    });
    expect(renderEmailMarkdown({ subject: "x", markdown: "Hi {{ contact firstName }}", values: {} })).toMatchObject({
      ok: false,
      failure: { code: "malformedMergeField" },
    });
    expect(renderEmailMarkdown({ subject: "Hi {{", markdown: "x", values: {} })).toMatchObject({
      ok: false,
      failure: { code: "malformedMergeField" },
    });
  });

  it("keeps sensitive fields out of the merge vocabulary", () => {
    expect(MERGE_FIELDS.filter((field) => UNMERGEABLE_FIELDS.has(field))).toEqual([]);
    for (const sensitive of ["contact.notes", "sender.passwordHash", "deal.notes"])
      expect(MERGE_FIELDS as readonly string[]).not.toContain(sensitive);
  });

  it("keeps https images at the email's width and drops images from any other scheme", () => {
    const result = renderEmailMarkdown({
      subject: "Cover",
      markdown:
        "![Whitepaper cover](https://cdn.example.com/cover.png)\n\n![tracker](http://evil.example/p.gif)\n\n![x](javascript:alert(1))",
      values: VALUES,
    });
    if (!result.ok) throw new Error(result.failure.code);

    expect(result.email.html).toContain('src="https://cdn.example.com/cover.png"');
    expect(result.email.html).toContain('alt="Whitepaper cover"');
    expect(result.email.html).toContain("max-width:100%");
    expect(result.email.html).not.toContain("evil.example");
    expect(result.email.html).not.toContain('src="javascript:');
    expect(result.email.html.match(/<img /g)).toHaveLength(1);
    expect(result.email.text).toContain("[Whitepaper cover]");
  });

  it("accepts only https banner links and escapes them into the banner tag", () => {
    expect(EmailImageUrlSchema.safeParse("https://cdn.example.com/banner.png").success).toBe(true);
    expect(EmailImageUrlSchema.safeParse("http://cdn.example.com/banner.png").success).toBe(false);
    expect(EmailImageUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(emailBannerHtml('https://cdn.example.com/a.png?x="y"')).toContain(
      'src="https://cdn.example.com/a.png?x=&quot;y&quot;"',
    );
  });
});
