import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  buttons: [] as Array<{ label: string; disabled?: boolean; onClick: () => void }>,
  inputs: [] as Array<{ id?: string }>,
  pending: [] as Promise<unknown>[],
}));

const forwardThreadAction = vi.hoisted(() => vi.fn());
const sendReplyAction = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => Promise<unknown>) => {
    harness.pending.push(action());
  },
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function labelOf(children: ReactNode): string {
  const parts = Array.isArray(children) ? children : [children];

  return parts.filter((part) => typeof part === "string").join("");
}

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) => {
    harness.buttons.push({ label: labelOf(children), disabled, onClick });
    return createElement("button", { disabled, type: "button" }, children);
  },
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: { id?: string }) => {
    harness.inputs.push(props);
    return createElement("input", { id: props.id });
  },
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: ReactNode }) => createElement("label", null, children),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: { placeholder?: string }) => createElement("textarea", { placeholder: props.placeholder }),
}));

vi.mock("../../actions", () => ({ forwardThreadAction, sendReplyAction }));

import { MailReplyBox, splitRecipients } from "../mail-reply-box";

const THREAD_ID = "00000000-0000-4000-8000-0000000000ea";

function render() {
  return renderToStaticMarkup(createElement(MailReplyBox, { threadId: THREAD_ID, onSent: vi.fn() }));
}

function buttonLabelled(label: string) {
  return harness.buttons.find((button) => button.label === label);
}

beforeEach(() => {
  harness.buttons.length = 0;
  harness.inputs.length = 0;
  harness.pending.length = 0;
  forwardThreadAction.mockReset();
  sendReplyAction.mockReset();
});

describe("splitRecipients", () => {
  it("reads a comma, semicolon or space separated list", () => {
    expect(splitRecipients("a@x.example, b@x.example; c@x.example d@x.example")).toEqual([
      "a@x.example",
      "b@x.example",
      "c@x.example",
      "d@x.example",
    ]);
  });

  it("returns nothing for an empty field", () => {
    expect(splitRecipients("   ")).toEqual([]);
  });
});

describe("MailReplyBox", () => {
  it("opens in reply mode, with no recipients field and nothing to send yet", () => {
    const markup = render();

    expect(markup).not.toContain("Mailbox.forwardRecipientsLabel");
    expect(harness.inputs).toHaveLength(0);
    expect(buttonLabelled("Mailbox.sendReply")?.disabled).toBe(true);
  });

  it("offers reply-all and forward alongside the send button", () => {
    render();

    expect(buttonLabelled("Mailbox.reply")).toBeDefined();
    expect(buttonLabelled("Mailbox.forward")).toBeDefined();
    expect(buttonLabelled("Mailbox.sendReply")).toBeDefined();
  });

  it("offers a cancel control that stays disabled until something is drafted", () => {
    render();

    expect(buttonLabelled("Mailbox.cancelReply")?.disabled).toBe(true);
  });

  it("sends nothing while the fields are empty", () => {
    render();

    buttonLabelled("Mailbox.sendReply")?.onClick();

    expect(sendReplyAction).not.toHaveBeenCalled();
    expect(forwardThreadAction).not.toHaveBeenCalled();
  });
});
