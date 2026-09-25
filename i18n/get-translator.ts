import { createTranslator } from "next-intl";

import type { AppLocale } from "./locale-registry";

import { applyBrand } from "./brand-messages";

type NamespaceArg = Parameters<typeof createTranslator>[0]["namespace"];

export async function getTranslator(locale: AppLocale, namespace?: NamespaceArg) {
  const messages = applyBrand((await import(`./locales/${locale}.json`)).default);
  return createTranslator({ locale, namespace, messages });
}
