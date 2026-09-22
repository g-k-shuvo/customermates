import { branding } from "@/core/config/branding";

import enMessages from "./locales/en.json";

const BRAND_PLACEHOLDER = "{brand}";

export function applyBrand<T>(value: T): T {
  if (typeof value === "string") return value.split(BRAND_PLACEHOLDER).join(branding.name) as T;
  if (Array.isArray(value)) return value.map((entry) => applyBrand(entry)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, applyBrand(entry)])) as T;

  return value;
}

export const brandedEnMessages = applyBrand(enMessages);
