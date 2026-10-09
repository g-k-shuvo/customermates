import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const branding = vi.hoisted(() => ({ marketingChromeDisabled: true }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ branding, layoutStore: { isMenuOpen: false, setIsMenuOpen: vi.fn() } }),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children }: { children: ReactNode }) => createElement("a", null, children),
  usePathname: () => "/auth/error",
}));

vi.mock("@/components/shared/locale-menu", () => ({ LocaleMenu: () => null }));
vi.mock("@/components/shared/theme-switcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));
vi.mock("@/app/[locale]/actions", () => ({ signOutAction: vi.fn(), signOutWithOnboardingIntentAction: vi.fn() }));

import { PublicNavbar } from "../../public-navbar";

function signOutButtons(markup: string) {
  return markup.split("UserAvatar.signOut").length - 1;
}

describe("PublicNavbar sign-out with the marketing chrome switched off", () => {
  it("still lets a deactivated member sign out, on wide and narrow layouts", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicNavbar, { accountState: "inactive", hasValidSession: true }),
    );

    expect(signOutButtons(markup)).toBe(2);
  });

  it("offers no sign-out to a visitor without a session", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicNavbar, { accountState: "unauthenticated", hasValidSession: false }),
    );

    expect(signOutButtons(markup)).toBe(0);
  });
});
