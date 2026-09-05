import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  menuItems: [] as Array<{ label: string; onSelect: () => void }>,
  userActions: [] as Array<() => unknown>,
}));

const dealCloseStore = vi.hoisted(() => ({
  isSubmitting: false,
  markWon: vi.fn(),
  openLostPrompt: vi.fn(),
  reopen: vi.fn(),
}));

const dealsStore = vi.hoisted(() => ({ isDisabled: false }));

vi.mock("mobx-react-lite", () => ({
  observer: <T>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ dealCloseStore, dealsStore }),
}));

vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => {
    harness.userActions.push(action);
    action();
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) =>
    createElement("button", { disabled, type: "button" }, children),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => createElement("div", { "data-menu": true }, children),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => {
    harness.menuItems.push({ label: String(Array.isArray(children) ? children.at(-1) : children), onSelect });
    return createElement("div", { "data-menu-item": true }, children);
  },
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

import { DealStatus } from "@/generated/prisma";

import { DealCloseActions } from "../deal-close-actions";

const openDeal = { id: "deal-1", status: DealStatus.open };
const wonDeal = { id: "deal-2", status: DealStatus.won };

beforeEach(() => {
  harness.menuItems.length = 0;
  harness.userActions.length = 0;
  dealCloseStore.isSubmitting = false;
  dealCloseStore.markWon.mockClear();
  dealCloseStore.openLostPrompt.mockClear();
  dealCloseStore.reopen.mockClear();
  dealsStore.isDisabled = false;
});

describe("DealCloseActions", () => {
  it("offers both closing transitions while the record is open", () => {
    const markup = renderToStaticMarkup(createElement(DealCloseActions, { deal: openDeal }));

    expect(markup).toContain("DealModal.close.markWon");
    expect(markup).toContain("DealModal.close.markLost");
    expect(markup).not.toContain("DealModal.close.reopen");
  });

  it("offers only the way back once the record is closed", () => {
    const markup = renderToStaticMarkup(createElement(DealCloseActions, { deal: wonDeal }));

    expect(markup).toContain("DealModal.close.reopen");
    expect(markup).not.toContain("DealModal.close.markWon");
    expect(markup).not.toContain("DealModal.close.markLost");
  });

  it("renders nothing without a record or without write access", () => {
    expect(renderToStaticMarkup(createElement(DealCloseActions, { deal: null }))).toBe("");

    dealsStore.isDisabled = true;
    expect(renderToStaticMarkup(createElement(DealCloseActions, { deal: openDeal }))).toBe("");
  });

  it("disables every transition while one is in flight", () => {
    dealCloseStore.isSubmitting = true;

    const markup = renderToStaticMarkup(createElement(DealCloseActions, { deal: openDeal }));

    expect(markup.match(/<button disabled/g)).toHaveLength(2);
  });

  it("routes each card action through the shared user-action boundary", () => {
    renderToStaticMarkup(createElement(DealCloseActions, { deal: openDeal, layout: "menu" }));

    expect(harness.menuItems.map(({ label }) => label)).toEqual([
      "DealModal.close.markWon",
      "DealModal.close.markLost",
    ]);

    for (const item of harness.menuItems) item.onSelect();

    expect(harness.userActions).toHaveLength(2);
    expect(dealCloseStore.markWon).toHaveBeenCalledWith("deal-1");
    expect(dealCloseStore.openLostPrompt).toHaveBeenCalledWith("deal-1");
  });

  it("reopens a closed record from the card menu", () => {
    renderToStaticMarkup(createElement(DealCloseActions, { deal: wonDeal, layout: "menu" }));

    expect(harness.menuItems.map(({ label }) => label)).toEqual(["DealModal.close.reopen"]);

    harness.menuItems[0].onSelect();

    expect(dealCloseStore.reopen).toHaveBeenCalledWith("deal-2");
  });
});
