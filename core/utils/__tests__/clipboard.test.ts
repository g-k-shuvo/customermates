import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyToClipboard } from "../clipboard";

const writeText = vi.fn<(text: string) => Promise<void>>();
const write = vi.fn<(items: unknown[]) => Promise<void>>();
const execCommand = vi.fn<(command: string) => boolean>();

class FakeClipboardItem {
  constructor(readonly data: Record<string, unknown>) {}
}

function installClipboard({ items = true }: { items?: boolean } = {}) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, write },
  });

  if (items) Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: FakeClipboardItem });
  else Reflect.deleteProperty(globalThis, "ClipboardItem");
}

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  write.mockResolvedValue(undefined);
  execCommand.mockReturnValue(true);
  document.execCommand = execCommand as unknown as typeof document.execCommand;
  installClipboard();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "ClipboardItem");
});

describe("copyToClipboard", () => {
  it("writes plain text through writeText", async () => {
    expect(await copyToClipboard("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(write).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("hands a pending promise to the clipboard API without awaiting it first", async () => {
    let resolveText: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      resolveText = resolve;
    });

    const copying = copyToClipboard(pending);

    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();

    resolveText("fetched later");

    expect(await copying).toBe(true);
  });

  it("resolves the promise itself when the browser has no ClipboardItem", async () => {
    installClipboard({ items: false });

    expect(await copyToClipboard(Promise.resolve("firefox path"))).toBe(true);
    expect(writeText).toHaveBeenCalledWith("firefox path");
  });

  it("falls back to a clipboard item when writeText is refused", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    expect(await copyToClipboard("hello")).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to the selection copy when both clipboard paths are refused", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    write.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

    expect(await copyToClipboard("hello")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when every path is refused", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    write.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    execCommand.mockReturnValue(false);

    expect(await copyToClipboard("hello")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("copies through the copy event on a plain-http page, where the clipboard API does not exist", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    let copied = "";
    execCommand.mockImplementation(() => {
      const data = { setData: (_type: string, value: string) => (copied = value) };
      const event = Object.assign(new Event("copy", { cancelable: true }), { clipboardData: data });
      document.dispatchEvent(event);
      return true;
    });

    expect(await copyToClipboard("http://crm.example/invitation/abc")).toBe(true);
    expect(copied).toBe("http://crm.example/invitation/abc");
  });

  it("reports failure instead of a false success when a dialog keeps focus away from the scratch textarea", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const trap = document.createElement("button");
    document.body.appendChild(trap);
    trap.focus();
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus").mockImplementation(() => {});

    expect(await copyToClipboard("hello")).toBe(false);

    focus.mockRestore();
    trap.remove();
  });

  it("removes the scratch textarea even when the copy command throws", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    write.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    execCommand.mockImplementation(() => {
      throw new Error("boom");
    });

    expect(await copyToClipboard("hello")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });
});
