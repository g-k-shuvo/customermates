import sanitizeHtml from "sanitize-html";

export const BLOCKED_IMAGE_ATTRIBUTE = "data-mailbox-blocked-src";

export type SanitizeEmailHtmlOptions = {
  allowRemoteImages?: boolean;
};

export type SanitizedEmailHtml = {
  html: string;
  blockedImageCount: number;
};

const ALLOWED_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"];

const REMOTE_IMAGE_SCHEME = /^https?:\/\//i;

function without(attribs: Record<string, string>, dropped: readonly string[]): Record<string, string> {
  const kept: Record<string, string> = {};

  for (const [name, value] of Object.entries(attribs)) if (!dropped.includes(name)) kept[name] = value;

  return kept;
}

const SAFE_STYLE = {
  "*": {
    "text-align": [/^left$|^right$|^center$|^justify$/],
    "font-weight": [/^bold$|^normal$|^\d{3}$/],
    "font-style": [/^italic$|^normal$/],
    "text-decoration": [/^underline$|^line-through$|^none$/],
    color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
    "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
  },
};

function baseOptions(allowRemoteImages: boolean, onImageBlocked: () => void): sanitizeHtml.IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", BLOCKED_IMAGE_ATTRIBUTE],
      td: ["colspan", "rowspan", "align", "valign"],
      th: ["colspan", "rowspan", "align", "valign"],
      table: ["align", "border", "cellpadding", "cellspacing", "width"],
      "*": ["style", "dir", "lang"],
    },
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
    allowProtocolRelative: false,
    allowedStyles: SAFE_STYLE,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "template", "iframe", "object", "embed"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (tagName, attribs) => {
        const incoming = without(attribs, [BLOCKED_IMAGE_ATTRIBUTE]);
        const source = (incoming.src ?? "").trim();
        if (source.length === 0) return { tagName, attribs: incoming };

        const withoutSource = without(incoming, ["src"]);
        if (!REMOTE_IMAGE_SCHEME.test(source)) return { tagName, attribs: withoutSource };
        if (allowRemoteImages) return { tagName, attribs: incoming };

        onImageBlocked();

        return { tagName, attribs: { ...withoutSource, [BLOCKED_IMAGE_ATTRIBUTE]: source } };
      },
    },
  };
}

export function sanitizeEmailHtml(
  raw: string | null | undefined,
  options: SanitizeEmailHtmlOptions = {},
): SanitizedEmailHtml {
  if (typeof raw !== "string" || raw.length === 0) return { html: "", blockedImageCount: 0 };

  let blockedImageCount = 0;
  const html = sanitizeHtml(
    raw,
    baseOptions(options.allowRemoteImages === true, () => (blockedImageCount += 1)),
  );

  return { html, blockedImageCount };
}
