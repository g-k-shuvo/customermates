import { describe, it, expect, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import type { InteractorOutcome } from "@/core/validation/validation.utils";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { ShareThreadInteractor } from "../share-thread.interactor";

const THREAD_ID = "00000000-0000-4000-8000-0000000000e1";

type Issue = { params?: { error?: CustomErrorCode } };

function errorCodesOf(result: InteractorOutcome<unknown>): (CustomErrorCode | undefined)[] {
  return result.ok ? [] : (result.error.issues as Issue[]).map((issue) => issue.params?.error);
}

function storedThread(sharedToCrm: boolean) {
  return {
    id: THREAD_ID,
    subject: "Quarterly numbers",
    lastMessageAt: new Date("2026-09-08T10:00:00Z"),
    lastMessagePreview: "Here they are",
    lastMessageIsSender: false,
    state: "open",
    sharedToCrm,
    participants: [{ identifier: "alice@vendor.example", displayName: "Alice", isSelf: false }],
  };
}

function interactorFor(existing: unknown) {
  const setThreadShared = vi.fn().mockResolvedValue(undefined);
  const setThreadDeal = vi.fn().mockResolvedValue(undefined);
  const findThreadWithMessages = vi.fn().mockResolvedValue(existing);

  return {
    interactor: new ShareThreadInteractor({ setThreadShared, setThreadDeal, findThreadWithMessages } as never),
    setThreadShared,
    setThreadDeal,
  };
}

describe("ShareThreadInteractor", () => {
  it("shares a private conversation and reports it as shared", async () => {
    const { interactor, setThreadShared } = interactorFor(storedThread(false));

    const result = await interactor.invoke({ threadId: THREAD_ID, shared: true });

    expect(setThreadShared).toHaveBeenCalledWith(THREAD_ID, true);
    expect(result.ok && result.data.sharedToCrm).toBe(true);
  });

  it("takes a shared conversation back off the records it matched", async () => {
    const { interactor, setThreadShared } = interactorFor(storedThread(true));

    const result = await interactor.invoke({ threadId: THREAD_ID, shared: false });

    expect(setThreadShared).toHaveBeenCalledWith(THREAD_ID, false);
    expect(result.ok && result.data.sharedToCrm).toBe(false);
  });

  it("removes the deal link when sharing is turned off, so private means private", async () => {
    const { interactor, setThreadDeal } = interactorFor(storedThread(true));

    await interactor.invoke({ threadId: THREAD_ID, shared: false });

    expect(setThreadDeal).toHaveBeenCalledWith(THREAD_ID, null);
  });

  it("leaves an existing deal link alone when a conversation is shared", async () => {
    const { interactor, setThreadDeal } = interactorFor(storedThread(false));

    await interactor.invoke({ threadId: THREAD_ID, shared: true });

    expect(setThreadDeal).not.toHaveBeenCalled();
  });

  it("reports an unknown conversation as not found and writes nothing", async () => {
    const { interactor, setThreadShared } = interactorFor(null);

    const result = await interactor.invoke({ threadId: THREAD_ID, shared: true });

    expect(result.ok).toBe(false);
    expect(errorCodesOf(result)).toContain(CustomErrorCode.mailboxThreadNotFound);
    expect(setThreadShared).not.toHaveBeenCalled();
  });

  it("rejects an identifier that is not a conversation id", async () => {
    const { interactor, setThreadShared } = interactorFor(storedThread(false));

    const result = await interactor.invoke({ threadId: "not-a-uuid", shared: true });

    expect(result.ok).toBe(false);
    expect(setThreadShared).not.toHaveBeenCalled();
  });
});
