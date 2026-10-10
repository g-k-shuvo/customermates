import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { hmacSha256Hex } from "@/core/utils/hmac";

import { IngestWebFormSubmissionInteractor } from "../ingest/ingest-web-form-submission.interactor";
import { UpdateWebFormSourceInteractor } from "../upsert/update-web-form-source.interactor";

const SECRET = "a-signing-secret";
const SOURCE_ID = "00000000-0000-4000-8000-000000000201";
const COMPANY_ID = "00000000-0000-4000-8000-000000000202";

function signed(body: string): string {
  const at = Math.floor(Date.now() / 1000);
  return `t=${at},v0=${hmacSha256Hex(SECRET, `${at}.${body}`)}`;
}

function ingestRepo(active: boolean) {
  return {
    findSourceBySlugUnscoped: vi
      .fn()
      .mockResolvedValue({ id: SOURCE_ID, companyId: COMPANY_ID, signingSecret: SECRET, active }),
    consumeRateLimitUnscoped: vi.fn().mockResolvedValue(true),
    storeSubmissionUnscoped: vi.fn().mockResolvedValue({ id: "submission-1", created: true }),
  };
}

describe("a submission for a paused source", () => {
  const body = JSON.stringify({ external_id: "7", fields: { email: "a@example.com" } });

  it("is stored but held back from processing, so the enquiry is not lost", async () => {
    const repo = ingestRepo(false);
    const backgroundTasks = { dispatch: vi.fn() };

    const result = await new IngestWebFormSubmissionInteractor(repo as never, backgroundTasks as never).invoke({
      slug: "contact-form",
      rawBody: body,
      signatureHeader: signed(body),
    });

    expect(result).toEqual({ ok: true, data: { outcome: "accepted", submissionId: "submission-1" } });
    expect(repo.storeSubmissionUnscoped).toHaveBeenCalledTimes(1);
    expect(backgroundTasks.dispatch).not.toHaveBeenCalled();
  });

  it("still refuses a bad signature while paused", async () => {
    const repo = ingestRepo(false);

    const result = await new IngestWebFormSubmissionInteractor(repo as never, { dispatch: vi.fn() } as never).invoke({
      slug: "contact-form",
      rawBody: body,
      signatureHeader: "t=1,v0=deadbeef",
    });

    expect(result).toEqual({ ok: true, data: { outcome: "invalid-signature", submissionId: null } });
    expect(repo.storeSubmissionUnscoped).not.toHaveBeenCalled();
  });

  it("is processed straight away when the source is accepting", async () => {
    const repo = ingestRepo(true);
    const backgroundTasks = { dispatch: vi.fn() };

    await new IngestWebFormSubmissionInteractor(repo as never, backgroundTasks as never).invoke({
      slug: "contact-form",
      rawBody: body,
      signatureHeader: signed(body),
    });

    expect(backgroundTasks.dispatch).toHaveBeenCalledWith("process-web-form-submission", {
      submissionId: "submission-1",
    });
  });
});

describe("resuming a paused source", () => {
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  let backgroundTasks: { dispatch: ReturnType<typeof vi.fn> };
  const precheck = { update: vi.fn().mockResolvedValue(undefined) };

  function source(active: boolean) {
    return {
      id: SOURCE_ID,
      name: "Contact Form",
      slug: "contact-form",
      active,
      defaultOwnerId: null,
      defaultLabels: [],
      dedupeLeads: false,
      fieldMapping: {},
      endpointPath: "/api/webforms/contact-form",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  beforeEach(() => {
    backgroundTasks = { dispatch: vi.fn() };
    repo = {
      getWebFormSourceOrThrowCompanyWide: vi.fn(),
      updateWebFormSourceOrThrow: vi.fn(),
      findHeldSubmissionIdsCompanyWide: vi.fn().mockResolvedValue(["held-1", "held-2"]),
    };
  });

  it("processes the submissions that arrived while it was paused", async () => {
    repo.getWebFormSourceOrThrowCompanyWide.mockResolvedValue(source(false));
    repo.updateWebFormSourceOrThrow.mockResolvedValue(source(true));

    await new UpdateWebFormSourceInteractor(repo as never, precheck as never, backgroundTasks as never).invoke({
      id: SOURCE_ID,
      active: true,
    });

    expect(backgroundTasks.dispatch.mock.calls).toEqual([
      ["process-web-form-submission", { submissionId: "held-1" }],
      ["process-web-form-submission", { submissionId: "held-2" }],
    ]);
  });

  it("does not reprocess anything when an accepting source is saved again", async () => {
    repo.getWebFormSourceOrThrowCompanyWide.mockResolvedValue(source(true));
    repo.updateWebFormSourceOrThrow.mockResolvedValue(source(true));

    await new UpdateWebFormSourceInteractor(repo as never, precheck as never, backgroundTasks as never).invoke({
      id: SOURCE_ID,
      active: true,
    });

    expect(repo.findHeldSubmissionIdsCompanyWide).not.toHaveBeenCalled();
    expect(backgroundTasks.dispatch).not.toHaveBeenCalled();
  });
});
