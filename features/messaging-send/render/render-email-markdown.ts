import type { MergeFailure, MergeValues } from "./merge-fields";

import markdownit from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { mergeValueFor, parseMergePlaceholders } from "./merge-fields";

export type RenderedEmail = { subject: string; html: string; text: string };

export type RenderEmailResult = { ok: true; email: RenderedEmail } | { ok: false; failure: MergeFailure };

const INK = "#1f2328";
const LINK = "#1d4ed8";
const MUTED = "#57606a";

const STYLES: Record<string, string> = {
  p: `margin:0 0 16px;font-size:15px;line-height:24px;color:${INK};`,
  h1: `margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${INK};`,
  h2: `margin:0 0 12px;font-size:18px;line-height:26px;font-weight:600;color:${INK};`,
  h3: `margin:0 0 12px;font-size:16px;line-height:24px;font-weight:600;color:${INK};`,
  ul: `margin:0 0 16px;padding-left:24px;font-size:15px;line-height:24px;color:${INK};`,
  ol: `margin:0 0 16px;padding-left:24px;font-size:15px;line-height:24px;color:${INK};`,
  li: "margin:0 0 4px;",
  a: `color:${LINK};text-decoration:underline;`,
  blockquote: `margin:0 0 16px;padding:0 0 0 12px;border-left:3px solid #d0d7de;color:${MUTED};`,
  hr: "border:none;border-top:1px solid #d0d7de;margin:24px 0;",
  code: "font-family:Menlo,Consolas,monospace;font-size:13px;background:#f6f8fa;padding:1px 4px;",
  img: "display:block;max-width:100%;height:auto;margin:0 0 16px;border:0;",
};

export const EMAIL_IMAGE_URL_MAX_LENGTH = 2048;

export const EmailImageUrlSchema = z.url({ protocol: /^https$/ }).max(EMAIL_IMAGE_URL_MAX_LENGTH);

export const EMAIL_BANNER_STYLE = "display:block;width:100%;max-width:100%;height:auto;margin:0 0 24px;border:0;";

export function emailBannerHtml(url: string): string {
  return `<img alt="" src="${escapeAttribute(url)}" style="${EMAIL_BANNER_STYLE}">`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const markdown = markdownit({ html: false, linkify: true, breaks: true, typographer: false });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const styled = (tagName: string, attribs: sanitizeHtml.Attributes) => ({
  tagName,
  attribs: { ...attribs, ...(STYLES[tagName] ? { style: STYLES[tagName] } : {}) },
});

function emailSafe(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "blockquote",
      "hr",
      "code",
      "img",
    ],
    allowedAttributes: { a: ["href", "style", "target", "rel"], img: ["src", "alt", "style"], "*": ["style"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
    allowProtocolRelative: false,
    transformTags: {
      h4: "h3",
      h5: "h3",
      h6: "h3",
      a: (tagName, attribs) => styled(tagName, { ...attribs, target: "_blank", rel: "noopener noreferrer" }),
      ...Object.fromEntries(
        Object.keys(STYLES)
          .filter((tag) => tag !== "a")
          .map((tag) => [tag, (tagName: string, attribs: sanitizeHtml.Attributes) => styled(tagName, attribs)]),
      ),
    },
  });
}

function plainText(html: string): string {
  return sanitizeHtml(
    html
      .replace(/<img [^>]*alt="([^"]*)"[^>]*>/g, "[$1]")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<\/(p|h1|h2|h3|li|blockquote)>/g, "\n")
      .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "$2 ($1)"),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mergeInto(template: string, values: MergeValues, token: (index: number) => string) {
  const parsed = parseMergePlaceholders(template);
  if (!parsed.ok) return parsed;

  const resolved: string[] = [];
  let withTokens = template;
  for (const [index, placeholder] of parsed.placeholders.entries()) {
    const value = mergeValueFor(placeholder, values);
    if (!value.ok) return value;

    resolved.push(value.value);
    withTokens = withTokens.replace(placeholder.raw, token(index));
  }

  return { ok: true as const, withTokens, resolved };
}

export function renderEmailMarkdown(args: {
  subject: string;
  markdown: string;
  values: MergeValues;
}): RenderEmailResult {
  const subject = mergeInto(args.subject, args.values, (index) => `\u0001${index}\u0001`);
  if (!subject.ok) return subject;

  const nonce = Math.random().toString(36).slice(2, 10);
  const token = (index: number) => `mergetoken${nonce}x${index}x`;
  const body = mergeInto(args.markdown, args.values, token);
  if (!body.ok) return body;

  const substitute = (text: string, escape: (value: string) => string) =>
    body.resolved.reduce((out, value, index) => out.split(token(index)).join(escape(value)), text);

  const html = emailSafe(markdown.render(body.withTokens));

  return {
    ok: true,
    email: {
      subject: subject.resolved
        .reduce((out, value, index) => out.split(`\u0001${index}\u0001`).join(value), subject.withTokens)
        .replace(/[\r\n]+/g, " ")
        .trim(),
      html: substitute(html, escapeHtml),
      text: substitute(plainText(html), (value) => value),
    },
  };
}
