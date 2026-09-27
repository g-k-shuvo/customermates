import type { RootStore } from "@/core/stores/root.store";
import type { WebFormSubmissionDto } from "@/features/webform/submissions/web-form-submission.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const retryWebFormSubmissionAction = vi.hoisted(() => vi.fn());
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("../../../actions", () => ({ retryWebFormSubmissionAction }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { WebFormSubmissionModalStore } from "../web-form-submission-modal.store";

const FAILED: WebFormSubmissionDto = {
  id: "3f4a1a52-6d0e-4f6f-9c29-3f6f0f7f5a11",
  sourceId: "5c1b2d63-7e1f-4a70-8d3a-4a7b1c8d9e22",
  sourceName: "Footer callback",
  externalId: "ext-1",
  status: "failed",
  error: "Contact could not be saved",
  email: "bob@buyer.example",
  name: "Bob",
  leadId: null,
  leadTitle: null,
  rawPayload: { fields: { email: "bob@buyer.example" } },
  receivedAt: new Date("2026-09-02T00:00:00Z"),
  processedAt: null,
};

function rootStore(canManage = true) {
  return {
    registerModalStore: vi.fn(),
    webFormSubmissionsStore: { refresh: vi.fn(() => Promise.resolve()) },
    userStore: { user: { id: "user" }, canManage: () => canManage, canAccess: () => true, can: () => true },
  } as unknown as RootStore;
}

describe("WebFormSubmissionModalStore", () => {
  beforeEach(() => {
    retryWebFormSubmissionAction.mockReset();
    toastZodErrorTree.mockReset();
  });

  it("offers a retry only for a failed submission without a lead, to someone who can manage leads", () => {
    const store = new WebFormSubmissionModalStore(rootStore());
    store.onInitOrRefresh(FAILED);
    expect(store.canRetry).toBe(true);

    store.onInitOrRefresh({ ...FAILED, status: "processed", leadId: "7a2c3e84-8f20-4b81-9e4b-5b8c2d9e0f33" });
    expect(store.canRetry).toBe(false);

    store.onInitOrRefresh({ ...FAILED, status: "received" });
    expect(store.canRetry).toBe(false);

    const readOnly = new WebFormSubmissionModalStore(rootStore(false));
    readOnly.onInitOrRefresh(FAILED);
    expect(readOnly.canRetry).toBe(false);
  });

  it("shows the requeued submission and refreshes the inbox after a retry", async () => {
    const root = rootStore();
    const store = new WebFormSubmissionModalStore(root);
    store.onInitOrRefresh(FAILED);
    retryWebFormSubmissionAction.mockResolvedValue({ ok: true, data: { ...FAILED, status: "received", error: null } });

    await store.retry();

    expect(retryWebFormSubmissionAction).toHaveBeenCalledWith({ id: FAILED.id });
    expect(store.form).toMatchObject({ status: "received", error: null });
    expect(root.webFormSubmissionsStore.refresh).toHaveBeenCalled();
    expect(store.isRetrying).toBe(false);
  });

  it("keeps the submission as it was and explains a refused retry", async () => {
    const store = new WebFormSubmissionModalStore(rootStore());
    store.onInitOrRefresh(FAILED);
    const error = { errors: ["Only a failed submission that has not created a lead can be retried."] };
    retryWebFormSubmissionAction.mockResolvedValue({ ok: false, error });

    await store.retry();

    expect(toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(store.form.status).toBe("failed");
    expect(store.isRetrying).toBe(false);
  });
});
