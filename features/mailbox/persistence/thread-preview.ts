const PREVIEW_LENGTH = 280;

const BRACKETED_LINK_TARGET = /\[([a-z][a-z0-9+.-]*):[^\]]*\]/gi;
const PREVIEWABLE_LINK_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

function withoutUnsafeLinkTargets(body: string): string {
  return body.replace(BRACKETED_LINK_TARGET, (match, scheme: string) =>
    PREVIEWABLE_LINK_SCHEMES.has(scheme.toLowerCase()) ? match : "",
  );
}

export function toThreadPreview(body: string): string | null {
  return withoutUnsafeLinkTargets(body).replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH) || null;
}
