import { describe, expect, it } from "vitest";

import { BLOCKED_IMAGE_ATTRIBUTE, sanitizeEmailHtml } from "../sanitize-email-html";

function sanitized(raw: string, allowRemoteImages = false) {
  return sanitizeEmailHtml(raw, { allowRemoteImages }).html;
}

describe("sanitizeEmailHtml", () => {
  it("keeps ordinary formatted mail intact", () => {
    const html = sanitized("<p>Hello <strong>Anna</strong>,<br>see the <em>quote</em>.</p>");

    expect(html).toContain("<strong>Anna</strong>");
    expect(html).toContain("<em>quote</em>");
  });

  it("removes a script tag and its contents", () => {
    const html = sanitized('<p>ok</p><script>alert("xss")</script>');

    expect(html).toContain("<p>ok</p>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("alert");
  });

  it("removes inline event handlers", () => {
    const html = sanitized('<p onclick="alert(1)" onmouseover="alert(2)">text</p>');

    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onmouseover");
    expect(html).toContain("text");
  });

  it("drops a javascript: link target", () => {
    const html = sanitized('<a href="javascript:alert(1)">click</a>');

    expect(html).not.toContain("javascript");
  });

  it("drops a javascript: url hidden by entity encoding", () => {
    const html = sanitized('<a href="&#106;avascript&#58;alert(1)">click</a>');

    expect(html.toLowerCase()).not.toContain("javascript");
  });

  it("drops a javascript: url broken up by control characters", () => {
    const html = sanitized('<a href="java\tscript:alert(1)">click</a>');

    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("drops a data: url", () => {
    const html = sanitized('<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>');

    expect(html).not.toContain("data:text/html");
  });

  it("keeps http, https and mailto links", () => {
    const html = sanitized(
      '<a href="https://vendor.example">a</a><a href="http://vendor.example">b</a><a href="mailto:anna@buyer.example">c</a>',
    );

    expect(html).toContain("https://vendor.example");
    expect(html).toContain("http://vendor.example");
    expect(html).toContain("mailto:anna@buyer.example");
  });

  it("forces external links to open safely", () => {
    const html = sanitized('<a href="https://vendor.example">a</a>');

    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("noreferrer");
  });

  it("removes an iframe entirely", () => {
    const html = sanitized('<iframe src="https://evil.example"></iframe><p>after</p>');

    expect(html).not.toContain("iframe");
    expect(html).toContain("after");
  });

  it("removes object, embed and form elements", () => {
    const html = sanitized(
      '<object data="x"></object><embed src="y"><form action="https://evil.example"><input name="a"></form><p>after</p>',
    );

    expect(html).not.toContain("object");
    expect(html).not.toContain("embed");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).toContain("after");
  });

  it("removes a style element so css cannot exfiltrate", () => {
    const html = sanitized("<style>body{background:url(https://evil.example/x)}</style><p>after</p>");

    expect(html).not.toContain("evil.example");
    expect(html).toContain("after");
  });

  it("strips a style attribute that is not on the safe list", () => {
    const html = sanitized(`<p style="position:fixed;background:url('https://evil.example/x')">text</p>`);

    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("position");
  });

  it("keeps harmless presentational styles", () => {
    const html = sanitized('<p style="text-align:center;font-weight:bold">text</p>');

    expect(html).toContain("text-align:center");
  });

  it("blocks a remote image by default and counts it", () => {
    const result = sanitizeEmailHtml('<img src="https://tracker.example/pixel.gif" alt="pixel">');

    expect(result.html).not.toMatch(/\ssrc=/);
    expect(result.html).toContain(`${BLOCKED_IMAGE_ATTRIBUTE}="https://tracker.example/pixel.gif"`);
    expect(result.html).toContain('alt="pixel"');
    expect(result.blockedImageCount).toBe(1);
  });

  it("does not render a blocked image as a live src", () => {
    const result = sanitizeEmailHtml('<img src="https://tracker.example/pixel.gif">');

    expect(result.html).not.toMatch(/\ssrc=/);
  });

  it("loads remote images once the reader opts in", () => {
    const result = sanitizeEmailHtml('<img src="https://cdn.example/logo.png">', { allowRemoteImages: true });

    expect(result.html).toContain('src="https://cdn.example/logo.png"');
    expect(result.blockedImageCount).toBe(0);
  });

  it("counts every blocked image in a tracking-heavy message", () => {
    const result = sanitizeEmailHtml(
      '<img src="https://a.example/1.gif"><img src="https://b.example/2.gif"><img src="https://c.example/3.gif">',
    );

    expect(result.blockedImageCount).toBe(3);
  });

  it("drops a javascript: image source rather than stashing it", () => {
    const result = sanitizeEmailHtml('<img src="javascript:alert(1)">');

    expect(result.html.toLowerCase()).not.toContain("javascript");
  });

  it("survives malformed and unclosed markup", () => {
    const html = sanitized('<p><b>unclosed <a href="https://vendor.example">link');

    expect(html).toContain("unclosed");
  });

  it("returns an empty string for absent bodies", () => {
    expect(sanitizeEmailHtml(null)).toEqual({ html: "", blockedImageCount: 0 });
    expect(sanitizeEmailHtml(undefined)).toEqual({ html: "", blockedImageCount: 0 });
    expect(sanitizeEmailHtml("")).toEqual({ html: "", blockedImageCount: 0 });
  });

  it("removes a protocol-relative url rather than trusting the page scheme", () => {
    const html = sanitized('<a href="//evil.example/x">click</a>');

    expect(html).not.toContain("//evil.example");
  });

  it("neutralises an svg payload", () => {
    const html = sanitized("<svg><script>alert(1)</script></svg><p>after</p>");

    expect(html).not.toContain("svg");
    expect(html).not.toContain("alert");
    expect(html).toContain("after");
  });

  it("neutralises a meta refresh redirect", () => {
    const html = sanitized('<meta http-equiv="refresh" content="0;url=https://evil.example"><p>after</p>');

    expect(html).not.toContain("evil.example");
    expect(html).toContain("after");
  });

  it("keeps table layout that real mail depends on", () => {
    const html = sanitized('<table border="0" cellpadding="4"><tr><td colspan="2" align="left">cell</td></tr></table>');

    expect(html).toContain("<table");
    expect(html).toContain("<td");
    expect(html).toContain("cell");
  });
});
