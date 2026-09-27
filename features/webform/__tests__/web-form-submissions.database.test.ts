import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "self-hosted",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    BETTER_AUTH_SECRET: "vitest-secret",
    RESEND_OPERATOR_EMAIL: "operator@example.invalid",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { interactorFailureKind, serializeInteractorFailure } = await import("@/core/validation/validation.utils");
const { CustomErrorCode } = await import("@/core/validation/validation.types");
const { FilterFieldKey } = await import("@/core/types/filter-field-key");
const { FilterOperatorKey } = await import("@/core/base/base-query-builder");
const { RetryWebFormSubmissionInteractor } = await import(
  "@/features/webform/submissions/retry-web-form-submission.interactor"
);
const { getGetWebFormSubmissionsInteractor, getWebFormSubmissionIdsValidator, getWebFormSubmissionRepo } = await import(
  "@/core/di"
);

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("the web form submissions inbox", () => {
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const adminId = randomUUID();
  const submission = { processed: randomUUID(), failed: randomUUID(), queued: randomUUID(), foreign: randomUUID() };
  const dispatch = vi.fn(() => Promise.resolve());

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.createMany({ data: [{ id: companyId }, { id: otherCompanyId }] });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      await prisma.user.create({
        data: {
          id: adminId,
          companyId,
          roleId: role.id,
          email: `admin-${adminId}@example.invalid`,
          firstName: "Inbox",
          lastName: "Admin",
          status: "active",
        },
      });
      const sourceFor = async (company: string) =>
        (
          await prisma.webFormSource.create({
            data: {
              companyId: company,
              name: "Footer callback",
              slug: `footer-${randomUUID()}`,
              signingSecret: "secret",
              fieldMapping: { email: "fields.email", firstName: "fields.first_name" },
            },
            select: { id: true },
          })
        ).id;
      const sourceId = await sourceFor(companyId);
      const otherSourceId = await sourceFor(otherCompanyId);
      const lead = await prisma.lead.create({ data: { companyId, title: "Callback from Ada" }, select: { id: true } });

      const rows = [
        [submission.processed, companyId, sourceId, "processed", null, lead.id, "ada@buyer.example", "Ada", 1],
        [
          submission.failed,
          companyId,
          sourceId,
          "failed",
          "Contact could not be saved",
          null,
          "bob@buyer.example",
          "Bob",
          2,
        ],
        [submission.queued, companyId, sourceId, "received", null, null, "cy@buyer.example", "Cy", 3],
        [submission.foreign, otherCompanyId, otherSourceId, "failed", "Other tenant", null, "x@else.example", "X", 4],
      ] as const;
      for (const [id, company, source, status, error, leadId, email, firstName, day] of rows) {
        await prisma.webFormSubmission.create({
          data: {
            id,
            companyId: company,
            sourceId: source,
            externalId: `ext-${id}`,
            rawPayload: { form_title: "Footer callback", fields: { email, first_name: firstName } },
            status,
            error,
            leadId,
            receivedAt: new Date(Date.UTC(2026, 8, day)),
            processedAt: status === "processed" ? new Date(Date.UTC(2026, 8, day, 1)) : null,
          },
        });
      }
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } }));
    await prisma.$disconnect();
  });

  const list = (params: Record<string, unknown> = {}) =>
    runAsBackgroundTenant(adminId, () => getGetWebFormSubmissionsInteractor().invoke(params as never));

  const retry = (id: string) =>
    runAsBackgroundTenant(adminId, () =>
      new RetryWebFormSubmissionInteractor(
        getWebFormSubmissionRepo(),
        { dispatch } as never,
        getWebFormSubmissionIdsValidator(),
      ).invoke({ id }),
    );

  it("lists only this company's submissions, newest first, with the submitter read through the field mapping", async () => {
    const result = await list();

    expect(result.ok).toBe(true);
    const items = result.ok ? result.data.items : [];
    expect(items.map((item) => item.id)).toEqual([submission.queued, submission.failed, submission.processed]);
    expect(items.find((item) => item.id === submission.processed)).toMatchObject({
      sourceName: "Footer callback",
      status: "processed",
      email: "ada@buyer.example",
      name: "Ada",
      leadTitle: "Callback from Ada",
    });
    expect(items.find((item) => item.id === submission.failed)).toMatchObject({
      status: "failed",
      error: "Contact could not be saved",
    });
  });

  it("filters to the failed submissions", async () => {
    const result = await list({
      filters: [{ field: FilterFieldKey.submissionStatus, operator: FilterOperatorKey.in, value: ["failed"] }],
    });

    expect(result.ok && result.data.items.map((item) => item.id)).toEqual([submission.failed]);
  });

  it("requeues a failed submission, clears its error and dispatches it for processing", async () => {
    const result = await retry(submission.failed);

    expect(result.ok && result.data).toMatchObject({ id: submission.failed, status: "received", error: null });
    expect(dispatch).toHaveBeenCalledWith("process-web-form-submission", { submissionId: submission.failed });
  });

  it("refuses to retry a submission that is not failed, including one that was just requeued", async () => {
    dispatch.mockClear();

    for (const id of [submission.processed, submission.queued, submission.failed]) {
      const result = await retry(id);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(interactorFailureKind(result.error)).toBe("conflict");
      expect(serializeInteractorFailure(result.error).issues).toEqual([
        expect.objectContaining({ customCode: CustomErrorCode.webFormSubmissionNotRetryable }),
      ]);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("treats another company's submission as not found", async () => {
    const result = await retry(submission.foreign);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(interactorFailureKind(result.error)).toBe("not_found");
    expect(serializeInteractorFailure(result.error).issues).toEqual([
      expect.objectContaining({ path: ["id"], customCode: CustomErrorCode.webFormSubmissionNotFound }),
    ]);
    const stored = await runWithoutTenant(() =>
      prisma.webFormSubmission.findUnique({ where: { id: submission.foreign }, select: { status: true } }),
    );
    expect(stored?.status).toBe("failed");
  });
});
