import { env } from "@/env";

export const UPSTREAM_BRAND_NAME = "Customermates";

export type Branding = {
  name: string;
  supportEmail: string;
  socialLoginDisabled: boolean;
  marketingChromeDisabled: boolean;
  vendorHelpDisabled: boolean;
};

export function resolveBranding(): Branding {
  return {
    name: env.BRAND_NAME?.trim() || UPSTREAM_BRAND_NAME,
    supportEmail: env.BRAND_SUPPORT_EMAIL?.trim() || env.RESEND_OPERATOR_EMAIL,
    socialLoginDisabled: env.AUTH_SOCIAL_LOGIN_DISABLED,
    marketingChromeDisabled: env.MARKETING_CHROME_DISABLED,
    vendorHelpDisabled: env.VENDOR_HELP_DISABLED,
  };
}

export const branding: Branding = resolveBranding();
