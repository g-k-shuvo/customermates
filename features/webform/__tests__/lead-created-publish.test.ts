import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({}));
vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));

import { ProcessWebFormSubmissionInteractor } from "../process/process-web-form-submission.interactor";
import { PublishLeadCreatedInteractor } from "../process/publish-lead-created.interactor";
import { DomainEvent } from "@/features/event/domain-events";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";
const FALLBACK_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_COMPANY_ID = "66666666-6666-4666-8666-666666666666";

const EVENT = { entityId: LEAD_ID, payload: { id: LEAD_ID, title: "A lead" } } as never;

function buildRepo(defaultOwnerId: string | null, fallbackUserId: string | null, ownerIsActiveMember = true) {
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
    findMappableCustomColumnsUnscoped: vi.fn().mockResolvedValue([]),
    fillEmptyContactCustomFieldsUnscoped: vi.fn().mockResolvedValue(undefined),
    markSubmissionProcessedUnscoped: vi.fn().mockResolvedValue(undefined),
    markSubmissionFailedUnscoped: vi.fn().mockResolvedValue(undefined),
    findLeadForEventOrThrowUnscoped: vi.fn().mockResolvedValue({ id: LEAD_ID, title: "A lead" }),
    findTaskCapableUserIdUnscoped: vi.fn().mockResolvedValue(fallbackUserId),
    findActiveCompanyUserIdUnscoped: vi.fn().mockResolvedValue(ownerIsActiveMember ? defaultOwnerId : null),
  };
}

async function process(repo: ReturnType<typeof buildRepo>) {
  const outcome = await new ProcessWebFormSubmissionInteractor(repo as never).invoke({ submissionId: SUBMISSION_ID });
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error("the submission did not process");

  return outcome.data;
}

function ownerWrittenOntoTheLead(repo: ReturnType<typeof buildRepo>) {
  return repo.createLeadFromSubmissionUnscoped.mock.calls[0]?.[0]?.ownerUserId;
}

describe("naming the user a web form lead is published as", () => {
  it("names the source owner when it is an active user of the submission's company", async () => {
    const repo = buildRepo(OWNER_ID, FALLBACK_ID);

    const outcome = await process(repo);

    expect(repo.findActiveCompanyUserIdUnscoped).toHaveBeenCalledWith(COMPANY_ID, OWNER_ID);
    expect(repo.findTaskCapableUserIdUnscoped).not.toHaveBeenCalled();
    expect(outcome).toEqual({ leadId: LEAD_ID, skipped: false, companyId: COMPANY_ID, publisherUserId: OWNER_ID });
    expect(ownerWrittenOntoTheLead(repo)).toBe(OWNER_ID);
  });

  it("falls back, for publisher and lead owner alike, when the source owner cannot act for the company", async () => {
    const repo = buildRepo(OWNER_ID, FALLBACK_ID, false);

    const outcome = await process(repo);

    expect(repo.findTaskCapableUserIdUnscoped).toHaveBeenCalledWith(COMPANY_ID);
    expect(outcome.publisherUserId).toBe(FALLBACK_ID);
    expect(ownerWrittenOntoTheLead(repo)).toBe(FALLBACK_ID);
  });

  it("publishes as a task-capable user but leaves the lead unowned when the source names no owner", async () => {
    const repo = buildRepo(null, FALLBACK_ID);

    const outcome = await process(repo);

    expect(repo.findActiveCompanyUserIdUnscoped).not.toHaveBeenCalled();
    expect(outcome.publisherUserId).toBe(FALLBACK_ID);
    expect(ownerWrittenOntoTheLead(repo)).toBeNull();
  });

  it("names nobody when the company has nobody who can act", async () => {
    const repo = buildRepo(OWNER_ID, null, false);

    const outcome = await process(repo);

    expect(outcome.publisherUserId).toBeNull();
    expect(outcome.companyId).toBe(COMPANY_ID);
    expect(ownerWrittenOntoTheLead(repo)).toBeNull();
  });

  it("resolves the publisher before it writes anything, so a failed lookup leaves the submission retryable", async () => {
    const repo = buildRepo(null, FALLBACK_ID);
    repo.findTaskCapableUserIdUnscoped.mockRejectedValueOnce(new Error("connection reset"));

    await expect(
      new ProcessWebFormSubmissionInteractor(repo as never).invoke({ submissionId: SUBMISSION_ID }),
    ).rejects.toThrow("connection reset");

    expect(repo.resolveContactUnscoped).not.toHaveBeenCalled();
    expect(repo.createLeadFromSubmissionUnscoped).not.toHaveBeenCalled();
    expect(repo.markSubmissionProcessedUnscoped).not.toHaveBeenCalled();
    expect(repo.markSubmissionFailedUnscoped).toHaveBeenCalledWith(SUBMISSION_ID, "connection reset");
  });
});

describe("publishing LEAD_CREATED", () => {
  let eventService: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  it("hands the workflow the event it is about to publish", async () => {
    const interactor = new PublishLeadCreatedInteractor(buildRepo(null, null) as never, eventService as never);

    const loaded = await interactor.invoke({ leadId: LEAD_ID, companyId: COMPANY_ID });

    expect(loaded).toEqual({ ok: true, data: { entityId: LEAD_ID, payload: { id: LEAD_ID, title: "A lead" } } });
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("publishes inside the tenant the workflow assumed, so its listeners run", async () => {
    const interactor = new PublishLeadCreatedInteractor(buildRepo(OWNER_ID, null) as never, eventService as never);

    await runWithTenant(createMockUser({ id: OWNER_ID, companyId: COMPANY_ID }), () =>
      interactor.publishAsTenant(EVENT, COMPANY_ID),
    );

    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEAD_CREATED, EVENT);
  });

  it("refuses to publish a lead into the tenant of another company", async () => {
    const interactor = new PublishLeadCreatedInteractor(buildRepo(OWNER_ID, null) as never, eventService as never);

    await expect(
      runWithTenant(createMockUser({ id: OWNER_ID, companyId: OTHER_COMPANY_ID }), () =>
        interactor.publishAsTenant(EVENT, COMPANY_ID),
      ),
    ).rejects.toThrow(/refused under a tenant of company/);
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("publishes system scoped when no user could be assumed", async () => {
    const interactor = new PublishLeadCreatedInteractor(buildRepo(null, null) as never, eventService as never);

    await interactor.publishAsSystem(EVENT, COMPANY_ID);

    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEAD_CREATED, EVENT, {
      systemCompanyId: COMPANY_ID,
    });
  });
});
