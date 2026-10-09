import type { $ZodIssue, $ZodRawIssue, ParseContext } from "zod/v4/core";
import type { ZodLocaleModule } from "./validation.types";

import { getTranslations } from "next-intl/server";

import { createErrorHandler } from "./validation.utils";
import { CustomErrorCode } from "./validation.types";

import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault, validationTagFor, type AppLocale } from "@/i18n/locale-registry";
import { getRequestAppLocale } from "@/i18n/request-app-locale";

type MessageReader = { raw: (key: string) => unknown };

async function localization(): Promise<{ appLocale: AppLocale; messages: MessageReader }> {
  try {
    return { appLocale: await getRequestAppLocale(), messages: await getTranslations() };
  } catch {
    const appLocale = appLocaleOrDefault(undefined);
    return { appLocale, messages: await getTranslator(appLocale) };
  }
}

function invalidFormatError(issue: $ZodRawIssue, errors: Record<string, string>): string | undefined {
  if (issue.code !== "invalid_format") return undefined;
  if (issue.format === "email") return errors[CustomErrorCode.invalidEmail];
  if (issue.format === "url") return errors[CustomErrorCode.invalidUrl];
  if (issue.format === "regex") return errors[CustomErrorCode.invalidPattern];
  return undefined;
}

function numberBoundError(issue: $ZodRawIssue, errors: Record<string, string>): string | undefined {
  if (issue.code === "too_small" && issue.origin === "number") {
    const code = issue.inclusive ? CustomErrorCode.numberTooSmall : CustomErrorCode.numberTooSmallExclusive;
    return errors[code]?.replace("{minimum}", String(issue.minimum));
  }
  if (issue.code === "too_big" && issue.origin === "number") {
    const code = issue.inclusive ? CustomErrorCode.numberTooBig : CustomErrorCode.numberTooBigExclusive;
    return errors[code]?.replace("{maximum}", String(issue.maximum));
  }
  return undefined;
}

function missingValueError(issue: $ZodRawIssue, errors: Record<string, string>): string | undefined {
  const emptyString = issue.code === "too_small" && issue.origin === "string" && issue.minimum === 1;
  const absent = issue.code === "invalid_type" && issue.input === undefined;
  return emptyString || absent ? errors[CustomErrorCode.required] : undefined;
}

export async function getZodParseContext(): Promise<ParseContext<$ZodIssue>> {
  const { appLocale, messages: t } = await localization();

  const customErrorTranslations = Object.fromEntries(
    Object.values(CustomErrorCode).map((code) => [code, t.raw(`Common.errors.${code}`) as string]),
  );

  const localeModule: ZodLocaleModule = await import(`zod/v4/locales/${validationTagFor(appLocale)}.js`);
  const localeConfig = localeModule.default();

  const customError = createErrorHandler(customErrorTranslations);

  return {
    error: (issue) =>
      customError(issue) ??
      invalidFormatError(issue, customErrorTranslations) ??
      missingValueError(issue, customErrorTranslations) ??
      numberBoundError(issue, customErrorTranslations) ??
      localeConfig.localeError(issue),
  };
}
