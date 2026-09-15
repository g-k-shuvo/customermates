import type { Metadata } from "next";
import type { HomepageRootMetadata } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { env } from "@/env";
import { branding } from "@/core/config/branding";
import { buildAlternateLanguages } from "@/core/seo/alternates";
import { buildLocalePath } from "@/i18n/locale-registry";

export const GLOBAL_METADATA: Metadata = {
  metadataBase: new URL(env.BASE_URL),
  icons: {
    icon: "/favicon.ico",
  },
  title: {
    default: branding.name,
    template: "%s",
  },
};

type BuildHomepageMetadataParams = {
  locale: ContentLocale;
  rootMetadata: HomepageRootMetadata;
  translatedLocales: readonly ContentLocale[];
};

export function buildHomepageMetadata({
  locale,
  rootMetadata,
  translatedLocales,
}: BuildHomepageMetadataParams): Metadata {
  const canonical = `${env.BASE_URL}${buildLocalePath(locale, "/")}`;
  const alternates = buildAlternateLanguages("/", translatedLocales, env.BASE_URL);
  const params = new URLSearchParams({
    description: rootMetadata.defaultDescription,
    title: rootMetadata.defaultTitle,
  });
  const defaultOgImageUrl = `/og/image.png?${params.toString()}`;

  return {
    alternates: alternates ? { canonical, languages: alternates } : { canonical },
    description: rootMetadata.defaultDescription,
    openGraph: {
      description: rootMetadata.defaultDescription,
      images: [defaultOgImageUrl],
      siteName: branding.name,
      title: rootMetadata.defaultTitle,
      type: "website",
      url: canonical,
    },
    title: {
      absolute: rootMetadata.defaultTitle,
    },
    twitter: {
      card: "summary_large_image",
      description: rootMetadata.defaultDescription,
      images: [defaultOgImageUrl],
      title: rootMetadata.defaultTitle,
    },
  };
}
