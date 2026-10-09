import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  sendReplyAction: vi.fn(),
  forwardThreadAction: vi.fn(),
  deleteMailDraftAction: vi.fn(),
  getMailDraftAction: vi.fn(),
  saveMailDraftAction: vi.fn(),
  scheduleMailAction: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => Promise<unknown>) => {
    void action();
  },
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectValue: () => null,
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: (value: Date) => value.toISOString() }),
}));

vi.mock("../../actions", () => actions);

import { MailReplyBox } from "../mail-reply-box";

const THREAD_ID = "00000000-0000-4000-8000-0000000000eb";
const DRAFT_SAVE_DELAY_MS = 800;
const FAILURE = { ok: false, error: { issues: [] } };

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function typeReply(text: string) {
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("no composer");

  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  act(() => {
    descriptor?.set?.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickSend() {
  const send = [...container.querySelectorAll("button")].find((button) => button.textContent === "Mailbox.sendReply");
  if (!send) throw new Error("no send button");

  act(() => send.click());
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  for (const action of Object.values(actions)) action.mockReset();
  actions.getMailDraftAction.mockResolvedValue({ ok: true, data: { draft: null } });
  actions.saveMailDraftAction.mockResolvedValue({ ok: true, data: { draft: { id: "draft" } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(MailReplyBox, { threadId: THREAD_ID, onSent: vi.fn() })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("MailReplyBox draft after a send", () => {
  it("keeps the text as a draft when the send fails, so a reload does not lose it", async () => {
    actions.sendReplyAction.mockResolvedValue(FAILURE);

    typeReply("The quote follows today.");
    clickSend();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    });

    expect(actions.sendReplyAction).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      body: "The quote follows today.",
      replyAll: false,
    });
    expect(actions.saveMailDraftAction).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: THREAD_ID, mode: "reply", body: "The quote follows today." }),
    );
  });

  it("saves no draft once the reply is sent", async () => {
    actions.sendReplyAction.mockResolvedValue({
      ok: true,
      data: { threadId: THREAD_ID, messageId: "<sent@x.example>", recipients: [], sentCopySaved: true },
    });

    typeReply("Sent straight away.");
    clickSend();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    });

    expect(actions.saveMailDraftAction).not.toHaveBeenCalled();
    expect(actions.deleteMailDraftAction).toHaveBeenCalledWith({ threadId: THREAD_ID });
  });
});
