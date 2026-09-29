import type { BulkJobHandler } from "../bulk-job-handler";
import type { RunningBulkJob } from "../bulk-job.repo";

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
    EMAIL_TRANSPORT: "console",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runAsBackgroundTenant } = await import("@/core/decorators/background-tenant");
const { BulkJobKind, BulkJobStatus } = await import("@/generated/prisma");
const { PrismaBulkJobRepo } = await import("../prisma-bulk-job.repository");
const { BulkJobStarter } = await import("../start-bulk-job");
const { FailBulkJobInteractor, FinishBulkJobInteractor, RunBulkJobPageInteractor } = await import(
  "../run/run-bulk-job.interactor"
);
const { GetBulkJobInteractor } = await import("../get/get-bulk-job.interactor");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

class CountingHandler implements BulkJobHandler {
  readonly kind = BulkJobKind.contactListFill;
  items = Array.from({ length: 450 }, (_, index) => String(index).padStart(4, "0"));
  seen: string[] = [];
  finished: { finalTotal: number; stale: boolean } | null = null;
  failedJobs: string[] = [];

  countTotal(): Promise<number> {
    return Promise.resolve(this.items.length);
  }

  processPage(_job: RunningBulkJob, cursor: string | null, take: number) {
    const page = this.items.filter((item) => cursor === null || item > cursor).slice(0, take);
    this.seen.push(...page);

    return Promise.resolve({ processed: page.length, nextCursor: page.length === take ? page[page.length - 1] : null });
  }

  finish(_job: RunningBulkJob, outcome: { finalTotal: number; stale: boolean }) {
    this.finished = outcome;
    return Promise.resolve();
  }

  fail(job: RunningBulkJob) {
    this.failedJobs.push(job.id);
    return Promise.resolve();
  }
}

describeDatabase("the bulk-job primitive", () => {
  const companyId = randomUUID();
  let userId: string;
  const dispatched: unknown[] = [];
  const background = {
    dispatch: (id: string, payload: unknown) => (dispatched.push({ id, payload }), Promise.resolve()),
  };

  beforeAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      const role = await prisma.userRole.create({
        data: { companyId, name: `Admin ${randomUUID()}`, isSystemRole: true },
        select: { id: true },
      });
      userId = (
        await prisma.user.create({
          data: {
            companyId,
            roleId: role.id,
            email: `owner-${randomUUID()}@example.invalid`,
            firstName: "Owner",
            lastName: "Tester",
            status: "active",
          },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  const as = <T>(fn: () => Promise<T>) => runAsBackgroundTenant(userId, fn);

  async function drain(handler: CountingHandler, jobId: string) {
    const repo = new PrismaBulkJobRepo();
    const page = new RunBulkJobPageInteractor(repo, { [handler.kind]: handler });
    let cursor: string | null = null;
    let pages = 0;
    do {
      const outcome = await as(() => page.invoke({ jobId, cursor }));
      if (!outcome.ok) throw new Error("page failed");
      cursor = outcome.data.nextCursor;
      pages += 1;
    } while (cursor !== null);

    return pages;
  }

  it("keyset-pages a definition, records progress, and confirms the count when it finishes", async () => {
    const handler = new CountingHandler();
    const repo = new PrismaBulkJobRepo();
    const subjectId = randomUUID();
    const starter = new BulkJobStarter(repo, { [handler.kind]: handler }, background as never);

    const started = await as(() => starter.start({ kind: handler.kind, subjectId, definition: { listId: subjectId } }));
    if (!started.ok) throw new Error("not started");
    expect(started.job).toMatchObject({ status: BulkJobStatus.running, expectedTotal: 450, processed: 0 });
    expect(dispatched.at(-1)).toEqual({ id: "run-bulk-job", payload: { jobId: started.job.id } });

    expect(await as(() => starter.start({ kind: handler.kind, subjectId, definition: {} }))).toEqual({
      ok: false,
      reason: "running",
    });

    expect(await drain(handler, started.job.id)).toBe(3);
    expect(handler.seen).toEqual(handler.items);

    handler.items.push("9999");
    const finish = await as(() =>
      new FinishBulkJobInteractor(repo, { [handler.kind]: handler }).invoke({ id: started.job.id }),
    );
    expect(finish).toEqual({ ok: true, data: { finalTotal: 451, stale: true } });
    expect(handler.finished).toEqual({ finalTotal: 451, stale: true });

    const job = await as(() => new GetBulkJobInteractor(repo).invoke({ id: started.job.id }));
    expect(job.ok && job.data).toMatchObject({
      status: BulkJobStatus.completed,
      processed: 450,
      expectedTotal: 450,
      finalTotal: 451,
      stale: true,
    });

    const again = await as(() => starter.start({ kind: handler.kind, subjectId, definition: {} }));
    expect(again.ok).toBe(true);
  });

  it("marks a failed job and lets the handler undo its side", async () => {
    const handler = new CountingHandler();
    const repo = new PrismaBulkJobRepo();
    const starter = new BulkJobStarter(repo, { [handler.kind]: handler }, background as never);
    const started = await as(() => starter.start({ kind: handler.kind, subjectId: randomUUID(), definition: {} }));
    if (!started.ok) throw new Error("not started");

    await as(() => new FailBulkJobInteractor(repo, { [handler.kind]: handler }).invoke({ id: started.job.id }));

    expect(handler.failedJobs).toEqual([started.job.id]);
    const job = await as(() => new GetBulkJobInteractor(repo).invoke({ id: started.job.id }));
    expect(job.ok && job.data).toMatchObject({ status: BulkJobStatus.failed, error: "stepFailed" });
    const page = await as(() =>
      new RunBulkJobPageInteractor(repo, { [handler.kind]: handler }).invoke({ jobId: started.job.id, cursor: null }),
    );
    expect(page).toEqual({ ok: true, data: { nextCursor: null } });
  });

  it("refuses a kind with no handler and reports an unknown job as not found", async () => {
    const repo = new PrismaBulkJobRepo();
    const starter = new BulkJobStarter(repo, {}, background as never);

    expect(
      await as(() => starter.start({ kind: BulkJobKind.campaignSend, subjectId: randomUUID(), definition: {} })),
    ).toEqual({ ok: false, reason: "unsupported" });
    expect((await as(() => new GetBulkJobInteractor(repo).invoke({ id: randomUUID() }))).ok).toBe(false);
  });
});
