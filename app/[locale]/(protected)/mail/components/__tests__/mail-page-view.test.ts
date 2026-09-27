import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: vi.fn() }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("../../actions", () => ({ getMailboxThreadAction: vi.fn(), getMailboxThreadsAction: vi.fn() }));
vi.mock("@/components/page-state/page-state", () => ({
  PageState: ({ title }: { title: string }) => createElement("div", { "data-page-state": title }),
}));
vi.mock("../mail-page-skeleton", () => ({ MailPageSkeleton: () => null }));
vi.mock("../mail-thread-toolbar", () => ({ ALL_FOLDERS_VALUE: "__all__", MailThreadToolbar: () => null }));
vi.mock("../mail-thread-list", () => ({
  MailThreadList: ({ selectedThreadId }: { selectedThreadId: string | null }) =>
    createElement("div", { "data-thread-list": selectedThreadId ?? "none" }),
}));
vi.mock("../mail-thread-panel", () => ({
  MailThreadPanel: ({ state }: { state: { status: string } }) =>
    createElement("div", { "data-thread-panel": state.status }),
}));

import { MailPageView } from "../mail-page-view";

const THREAD_ID = "00000000-0000-4000-8000-0000000000f1";

describe("MailPageView deep link", () => {
  it("opens the linked conversation even when the caller's own mailbox is empty", () => {
    const html = renderToStaticMarkup(
      createElement(MailPageView, { threads: [], folders: [], initialThreadId: THREAD_ID }),
    );

    expect(html).toContain('data-thread-panel="loading"');
    expect(html).toContain(`data-thread-list="${THREAD_ID}"`);
    expect(html).not.toContain('data-page-state="Mailbox.emptyTitle"');
  });

  it("keeps the empty state when nothing is linked and there is no mail", () => {
    const html = renderToStaticMarkup(createElement(MailPageView, { threads: [], folders: [] }));

    expect(html).toContain('data-page-state="Mailbox.emptyTitle"');
    expect(html).not.toContain("data-thread-panel");
  });
});
