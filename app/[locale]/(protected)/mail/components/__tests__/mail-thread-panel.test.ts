import type { MailboxThreadDealLinkDto } from "@/features/mailbox/mailbox.schema";
import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  switches: [] as Array<{ checked: boolean; disabled?: boolean; onCheckedChange: (next: boolean) => void }>,
  buttons: [] as Array<{ label: string; disabled?: boolean; onClick?: () => void }>,
  pending: [] as Promise<unknown>[],
  successes: [] as string[],
}));

const shareThreadAction = vi.hoisted(() => vi.fn());
const linkThreadDealAction = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: () => "Deal", plural: () => "Deals" }),
}));

vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => Promise<unknown>) => {
    harness.pending.push(action());
  },
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

vi.mock("sonner", () => ({
  toast: {
    success: (message: string) => {
      harness.successes.push(message);
    },
  },
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "01/09/2026" }),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: { checked: boolean; disabled?: boolean; onCheckedChange: (next: boolean) => void }) => {
    harness.switches.push(props);
    return createElement("input", { defaultChecked: props.checked, disabled: props.disabled, type: "checkbox" });
  },
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: ReactNode }) => createElement("label", null, children),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) => {
    harness.buttons.push({ label: String(children), disabled, onClick });
    return createElement("button", { disabled, type: "button" }, children);
  },
}));

vi.mock("@/components/page-state/page-state", () => ({
  PageState: ({ title }: { title?: string }) => createElement("div", null, title),
}));

vi.mock("../mail-page-skeleton", () => ({
  MailPageSkeleton: () => createElement("div", null),
}));

vi.mock("../mail-reply-box", () => ({
  MailReplyBox: () => createElement("div", { "data-reply-box": true }),
}));

vi.mock("../../actions", () => ({ shareThreadAction, linkThreadDealAction }));

import { MailThreadPanel } from "../mail-thread-panel";

const THREAD_ID = "00000000-0000-4000-8000-0000000000e9";
const DEAL_ID = "00000000-0000-4000-8000-0000000000d1";

const NO_DEAL_LINK: MailboxThreadDealLinkDto = {
  linkedDealId: null,
  linkedDealName: null,
  offeredDealId: null,
  offeredDealName: null,
  openDealCount: 0,
};

function thread(sharedToCrm: boolean, dealLink: MailboxThreadDealLinkDto = NO_DEAL_LINK, matchedContactCount = 0) {
  return {
    dealLink,
    matchedContactCount,
    id: THREAD_ID,
    subject: "Quarterly numbers",
    lastMessageAt: new Date("2026-09-08T10:00:00Z"),
    lastMessagePreview: "Here they are",
    lastMessageIsSender: false,
    unread: false,
    sharedToCrm,
    participants: [{ identifier: "alice@vendor.example", displayName: "Alice" }],
    messages: [
      {
        id: "message-1",
        subject: "Quarterly numbers",
        bodyText: "Numbers attached.",
        bodyHtml: null,
        blockedImageCount: 0,
        outbound: false,
        isDraft: false,
        sentAt: new Date("2026-09-08T10:00:00Z"),
        senderIdentifier: "alice@vendor.example",
      },
    ],
  };
}

function renderPanel(
  sharedToCrm: boolean,
  dealLink: MailboxThreadDealLinkDto = NO_DEAL_LINK,
  onSharedChanged = vi.fn(),
  matchedContactCount = 0,
) {
  const markup = renderToStaticMarkup(
    createElement(MailThreadPanel, {
      state: { status: "ready", thread: thread(sharedToCrm, dealLink, matchedContactCount) },
      onReplySent: vi.fn(),
      onSharedChanged,
      onShowRemoteImages: vi.fn(),
    }),
  );

  return { markup, onSharedChanged };
}

function buttonLabelled(prefix: string) {
  return harness.buttons.find((button) => button.label.startsWith(prefix));
}

beforeEach(() => {
  harness.switches.length = 0;
  harness.buttons.length = 0;
  harness.pending.length = 0;
  harness.successes.length = 0;
  shareThreadAction.mockReset();
  linkThreadDealAction.mockReset();
});

describe("MailThreadPanel sharing", () => {
  it("offers the share control with copy that says who else would read the conversation", () => {
    const { markup } = renderPanel(false);

    expect(markup).toContain("Mailbox.shareLabel");
    expect(markup).toContain("Mailbox.shareDescriptionOff");
    expect(harness.switches.at(0)?.checked).toBe(false);
  });

  it("puts a contact match to the reader as an offer rather than sharing on its own", () => {
    const { markup } = renderPanel(false, NO_DEAL_LINK, vi.fn(), 2);

    expect(markup).toContain("Mailbox.shareOfferDescription");
    expect(markup).toContain("&quot;count&quot;:2");
    expect(markup).not.toContain("Mailbox.shareDescriptionOff");
    expect(harness.switches.at(0)?.checked).toBe(false);
  });

  it("explains the consequence differently once the conversation is shared", () => {
    const { markup } = renderPanel(true);

    expect(markup).toContain("Mailbox.shareDescriptionOn");
    expect(harness.switches.at(0)?.checked).toBe(true);
  });

  it("shares the conversation through the interactor and reports the stored answer upwards", async () => {
    shareThreadAction.mockResolvedValue({ ok: true, data: { ...thread(true) } });
    const { onSharedChanged } = renderPanel(false, NO_DEAL_LINK);

    harness.switches.at(0)?.onCheckedChange(true);
    await Promise.all(harness.pending);

    expect(shareThreadAction).toHaveBeenCalledWith({ threadId: THREAD_ID, shared: true });
    expect(onSharedChanged).toHaveBeenCalledWith(THREAD_ID, true);
    expect(harness.successes).toEqual(["Mailbox.shareEnabled"]);
  });

  it("takes a shared conversation back off the records it matched", async () => {
    shareThreadAction.mockResolvedValue({ ok: true, data: { ...thread(false) } });
    const { onSharedChanged } = renderPanel(true, NO_DEAL_LINK);

    harness.switches.at(0)?.onCheckedChange(false);
    await Promise.all(harness.pending);

    expect(shareThreadAction).toHaveBeenCalledWith({ threadId: THREAD_ID, shared: false });
    expect(onSharedChanged).toHaveBeenCalledWith(THREAD_ID, false);
    expect(harness.successes).toEqual(["Mailbox.shareDisabled"]);
  });

  it("leaves the conversation alone when the action fails", async () => {
    shareThreadAction.mockResolvedValue({ ok: false, error: { errors: [] } });
    const { onSharedChanged } = renderPanel(false, NO_DEAL_LINK);

    harness.switches.at(0)?.onCheckedChange(true);
    await Promise.all(harness.pending);

    expect(onSharedChanged).not.toHaveBeenCalled();
    expect(harness.successes).toEqual([]);
  });
});

const OFFERED_DEAL_LINK: MailboxThreadDealLinkDto = {
  linkedDealId: null,
  linkedDealName: null,
  offeredDealId: DEAL_ID,
  offeredDealName: "Acme renewal",
  openDealCount: 1,
};

const LINKED_DEAL: MailboxThreadDealLinkDto = {
  linkedDealId: DEAL_ID,
  linkedDealName: "Acme renewal",
  offeredDealId: null,
  offeredDealName: null,
  openDealCount: 1,
};

const AMBIGUOUS_DEAL_LINK: MailboxThreadDealLinkDto = {
  linkedDealId: null,
  linkedDealName: null,
  offeredDealId: null,
  offeredDealName: null,
  openDealCount: 3,
};

describe("MailThreadPanel deal link", () => {
  it("offers the single open deal next to the share toggle instead of linking it silently", () => {
    const { markup } = renderPanel(true, OFFERED_DEAL_LINK);

    expect(markup).toContain("Mailbox.dealLinkLabel");
    expect(markup).toContain("Mailbox.dealOfferDescription");
    expect(markup).toContain("Acme renewal");
    expect(buttonLabelled("Mailbox.dealLinkConfirm")).toBeDefined();
  });

  it("says why nothing was linked when the matched contacts hold several open deals", () => {
    const { markup } = renderPanel(true, AMBIGUOUS_DEAL_LINK);

    expect(markup).toContain("Mailbox.dealAmbiguousDescription");
    expect(markup).toContain("&quot;count&quot;:3");
    expect(buttonLabelled("Mailbox.dealLinkConfirm")).toBeUndefined();
  });

  it("stays out of the way when no open deal matches the conversation", () => {
    const { markup } = renderPanel(true);

    expect(markup).not.toContain("Mailbox.dealLinkLabel");
    expect(buttonLabelled("Mailbox.dealLinkConfirm")).toBeUndefined();
  });

  it("confirms only the deal that was offered and reports the sharing the link caused", async () => {
    linkThreadDealAction.mockResolvedValue({
      ok: true,
      data: { threadId: THREAD_ID, sharedToCrm: true, dealLink: LINKED_DEAL },
    });
    const { onSharedChanged } = renderPanel(false, OFFERED_DEAL_LINK);

    buttonLabelled("Mailbox.dealLinkConfirm")?.onClick?.();
    await Promise.all(harness.pending);

    expect(linkThreadDealAction).toHaveBeenCalledWith({ threadId: THREAD_ID, dealId: DEAL_ID });
    expect(onSharedChanged).toHaveBeenCalledWith(THREAD_ID, true);
    expect(harness.successes.at(0)).toContain("Mailbox.dealLinked");
  });

  it("removes an existing link by sending no deal at all", async () => {
    linkThreadDealAction.mockResolvedValue({
      ok: true,
      data: { threadId: THREAD_ID, sharedToCrm: true, dealLink: NO_DEAL_LINK },
    });
    renderPanel(true, LINKED_DEAL);

    expect(buttonLabelled("Mailbox.dealLinkConfirm")).toBeUndefined();
    buttonLabelled("Mailbox.dealUnlink")?.onClick?.();
    await Promise.all(harness.pending);

    expect(linkThreadDealAction).toHaveBeenCalledWith({ threadId: THREAD_ID, dealId: null });
    expect(harness.successes).toEqual(["Mailbox.dealUnlinked"]);
  });

  it("leaves the conversation alone when the link is rejected", async () => {
    linkThreadDealAction.mockResolvedValue({ ok: false, error: { errors: [] } });
    const { onSharedChanged } = renderPanel(false, OFFERED_DEAL_LINK);

    buttonLabelled("Mailbox.dealLinkConfirm")?.onClick?.();
    await Promise.all(harness.pending);

    expect(onSharedChanged).not.toHaveBeenCalled();
    expect(harness.successes).toEqual([]);
  });
});
