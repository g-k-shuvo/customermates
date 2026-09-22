import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({}));
vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));

const runAsBackgroundTenant = vi.fn((_userId: string, fn: () => unknown) => Promise.resolve(fn()));

vi.mock("@/core/decorators/background-tenant", () => ({
  runAsBackgroundTenant: (userId: string, fn: () => unknown) => runAsBackgroundTenant(userId, fn),
}));

import { ProcessWebFormSubmissionInteractor } from "../process/process-web-form-submission.interactor";
import { DomainEvent } from "@/features/event/domain-events";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";
const FALLBACK_ID = "55555555-5555-4555-8555-555555555555";

function buildRepo(defaultOwnerId: string | null, fallbackUserId: string | null) {
  return {
    findPendingSubmissionUnscoped: vi.fn().mockResolvedValue({
      id: SUBMISSION_ID,
      companyId: COMPANY_ID,
      sourceId: "source-1",
      rawPayload: { fields: { email: "grace@computingpioneers.test" } },
      sourceName: "Contact Form",
      fieldMapping: { email: "fields.email", titleTemplate: "{{email}}" },
      defaultOwnerId,
      defaultLabels: [],
    }),
    resolveContactUnscoped: vi.fn().mockResolvedValue(null),
    resolveOrganizationUnscoped: vi.fn().mockResolvedValue(null),
    createLeadFromSubmissionUnscoped: vi.fn().mockResolvedValue(LEAD_ID),
    markSubmissionProcessedUnscoped: vi.fn().mockResolvedValue(undefined),
    markSubmissionFailedUnscoped: vi.fn().mockResolvedValue(undefined),
    findLeadForEventUnscoped: vi.fn().mockResolvedValue({ id: LEAD_ID, title: "A lead" }),
    findTaskCapableUserIdUnscoped: vi.fn().mockResolvedValue(fallbackUserId),
  };
}

describe("publishing LEAD_CREATED from a web form submission", () => {
  let eventService: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    runAsBackgroundTenant.mockClear();
    eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  it("publishes as the source owner when the source has one", async () => {
    const repo = buildRepo(OWNER_ID, FALLBACK_ID);
    const interactor = new ProcessWebFormSubmissionInteractor(repo as never, eventService as never);

    await interactor.invoke({ submissionId: SUBMISSION_ID });

    expect(repo.findTaskCapableUserIdUnscoped).not.toHaveBeenCalled();
    expect(runAsBackgroundTenant).toHaveBeenCalledWith(OWNER_ID, expect.any(Function));
    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEAD_CREATED, expect.anything());
  });

  it("falls back to a task-capable user so in-process listeners still run", async () => {
    const repo = buildRepo(null, FALLBACK_ID);
    const interactor = new ProcessWebFormSubmissionInteractor(repo as never, eventService as never);

    await interactor.invoke({ submissionId: SUBMISSION_ID });

    expect(repo.findTaskCapableUserIdUnscoped).toHaveBeenCalledWith(COMPANY_ID);
    expect(runAsBackgroundTenant).toHaveBeenCalledWith(FALLBACK_ID, expect.any(Function));
    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEAD_CREATED, expect.anything());
  });

  it("publishes system scoped only when the company has nobody who can act", async () => {
    const repo = buildRepo(null, null);
    const interactor = new ProcessWebFormSubmissionInteractor(repo as never, eventService as never);

    await interactor.invoke({ submissionId: SUBMISSION_ID });

    expect(runAsBackgroundTenant).not.toHaveBeenCalled();
    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEAD_CREATED, expect.anything(), {
      systemCompanyId: COMPANY_ID,
    });
  });
});
