import type { NextRequest } from "next/server";
import type { UnsubscribeOutcome } from "@/features/messaging-send/suppression/unsubscribe.interactor";

import { getUnsubscribeInteractor } from "@/core/di";
import { unsubscribeLimiter } from "@/features/messaging-send/suppression/unsubscribe-rate-limit";
import { getTranslator } from "@/i18n/get-translator";
import { DEFAULT_LOCALE, appLocaleFromLanguageTag } from "@/i18n/locale-registry";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function localeOf(request: NextRequest) {
  const first = (request.headers.get("accept-language") ?? "").split(",")[0]?.split(";")[0]?.trim() ?? "";

  return appLocaleFromLanguageTag(first) ?? DEFAULT_LOCALE;
}

function clientKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

async function page(
  request: NextRequest,
  body: (t: Awaited<ReturnType<typeof getTranslator>>) => string,
  status = 200,
) {
  const locale = localeOf(request);
  const t = await getTranslator(locale, "Unsubscribe");
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(t("title"))}</title><style>body{font-family:system-ui,sans-serif;background:#f6f8fa;color:#1f2328;margin:0;padding:48px 16px}main{max-width:28rem;margin:0 auto;background:#fff;border:1px solid #d0d7de;border-radius:12px;padding:24px}h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;margin:0 0 16px}button{font:inherit;background:#1f2328;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}</style></head><body><main>${body(t)}</main></body></html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}

function resultPage(request: NextRequest, outcome: UnsubscribeOutcome) {
  return page(request, (t) => {
    if (outcome.status === "unknown")
      return `<h1>${escapeHtml(t("unknownTitle"))}</h1><p>${escapeHtml(t("unknownBody"))}</p>`;

    const title = outcome.status === "alreadyUnsubscribed" ? t("alreadyTitle") : t("doneTitle");

    return `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(t("doneBody", { address: outcome.address }))}</p>`;
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const outcome = await getUnsubscribeInteractor().lookup({ token });
  if (outcome.status !== "unsubscribed") return resultPage(request, outcome);

  return page(
    request,
    (t) =>
      `<h1>${escapeHtml(t("confirmTitle"))}</h1><p>${escapeHtml(t("confirmBody", { address: outcome.address }))}</p><form method="post"><button type="submit">${escapeHtml(t("confirm"))}</button></form>`,
  );
}

export async function POST(request: NextRequest, { params }: Params) {
  if (!unsubscribeLimiter.allow(clientKey(request)))
    return page(request, (t) => `<h1>${escapeHtml(t("limitedTitle"))}</h1><p>${escapeHtml(t("limitedBody"))}</p>`, 429);

  const { token } = await params;
  const result = await getUnsubscribeInteractor().invoke({ token });

  return resultPage(request, result.ok ? result.data : { status: "unknown" });
}
