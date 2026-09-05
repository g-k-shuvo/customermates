import { describe, it, expect, vi, beforeEach } from "vitest";

const captureException = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({ captureException }));

import type { DealStageHistoryRepo, OpenStageHistory } from "../listener/deal-stage-history.listener";
import type { DomainEventMap } from "@/features/event/domain-events";

import { DealStageHistoryListener } from "../listener/deal-stage-history.listener";
import { DomainEvent } from "@/features/event/domain-events";
import { DealStatus } from "@/generated/prisma";

const COMPANY_ID = "00000000-0000-4000-8000-0000000000c0";
const USER_ID = "00000000-0000-4000-8000-0000000000a0";
const DEAL_ID = "00000000-0000-4000-8000-000000000001";
const QUALIFIED_STAGE_ID = "00000000-0000-4000-8000-000000000050";
const PROPOSAL_STAGE_ID = "00000000-0000-4000-8000-000000000051";
const RENEWAL_STAGE_ID = "00000000-0000-4000-8000-000000000052";
const NEW_BUSINESS_PIPELINE_ID = "00000000-0000-4000-8000-000000000060";
const RENEWALS_PIPELINE_ID = "00000000-0000-4000-8000-000000000061";
const HISTORY_ID = "00000000-0000-4000-8000-000000000070";

const ENTERED_AT = new Date("2026-09-01T00:00:00.000Z");
const MOVED_AT = new Date("2026-09-03T01:30:45.000Z");

type StubRepo = {
  findOpenStageHistory: ReturnType<typeof vi.fn>;
  closeStageHistory: ReturnType<typeof vi.fn>;
  openStageHistory: ReturnType<typeof vi.fn>;
};

function makeRepo(openRow: OpenStageHistory | null = null): StubRepo {
  return {
    findOpenStageHistory: vi.fn().mockResolvedValue(openRow),
    closeStageHistory: vi.fn().mockResolvedValue(undefined),
    openStageHistory: vi.fn().mockResolvedValue(undefined),
  };
}

function makeListener(repo: StubRepo) {
  return new DealStageHistoryListener(repo as unknown as DealStageHistoryRepo);
}

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    name: "Renewal for Acme",
    totalValue: 100,
    totalQuantity: 1,
    weightedValue: null,
    notes: null,
    pipelineId: NEW_BUSINESS_PIPELINE_ID,
    stageId: QUALIFIED_STAGE_ID,
    status: DealStatus.open,
    expectedCloseDate: null,
    probability: null,
    stageEnteredAt: ENTERED_AT,
    lostReasonId: null,
    lostNotes: null,
    wonAt: null,
    lostAt: null,
    closedAt: null,
    createdAt: ENTERED_AT,
    updatedAt: ENTERED_AT,
    organizations: [],
    users: [],
    contacts: [],
    services: [],
    tasks: [],
    customFieldValues: [],
    ...overrides,
  };
}

function dealUpdated(deal: Record<string, unknown>, changes: Record<string, { previous: unknown; current: unknown }>) {
  return {
    userId: USER_ID,
    companyId: COMPANY_ID,
    entityId: DEAL_ID,
    payload: { deal, changes },
  } as unknown as DomainEventMap[DomainEvent.DEAL_UPDATED];
}

function dealCreated(deal: Record<string, unknown>) {
  return {
    userId: USER_ID,
    companyId: COMPANY_ID,
    entityId: DEAL_ID,
    payload: deal,
  } as unknown as DomainEventMap[DomainEvent.DEAL_CREATED];
}

function openRow(overrides: Partial<OpenStageHistory> = {}): OpenStageHistory {
  return { id: HISTORY_ID, toStageId: QUALIFIED_STAGE_ID, enteredAt: ENTERED_AT, ...overrides };
}

describe("DealStageHistoryListener", () => {
  beforeEach(() => captureException.mockClear());

  it("declares handlers for deal creation and deal update", () => {
    const listener = makeListener(makeRepo());

    expect(listener.handles(DomainEvent.DEAL_CREATED)).toBe(true);
    expect(listener.handles(DomainEvent.DEAL_UPDATED)).toBe(true);
    expect(listener.handles(DomainEvent.DEAL_DELETED)).toBe(false);
  });

  it("writes nothing when a relation-only change republishes the whole deal", async () => {
    const repo = makeRepo(openRow());

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal(), { contacts: { previous: [], current: [{ id: "c1" }] } }),
    );

    expect(repo.findOpenStageHistory).not.toHaveBeenCalled();
    expect(repo.closeStageHistory).not.toHaveBeenCalled();
    expect(repo.openStageHistory).not.toHaveBeenCalled();
  });

  it("writes nothing when an update carries no changes at all", async () => {
    const repo = makeRepo(openRow());

    await makeListener(repo).handle(DomainEvent.DEAL_UPDATED, {
      userId: USER_ID,
      companyId: COMPANY_ID,
      entityId: DEAL_ID,
      payload: makeDeal(),
    } as unknown as DomainEventMap[DomainEvent.DEAL_UPDATED]);

    expect(repo.findOpenStageHistory).not.toHaveBeenCalled();
    expect(repo.openStageHistory).not.toHaveBeenCalled();
  });

  it("closes the open row and opens a new one on a stage change", async () => {
    const repo = makeRepo(openRow());

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
        stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
      }),
    );

    expect(repo.closeStageHistory).toHaveBeenCalledExactlyOnceWith({
      id: HISTORY_ID,
      exitedAt: MOVED_AT,
      durationSeconds: 178245,
    });
    expect(repo.openStageHistory).toHaveBeenCalledExactlyOnceWith({
      dealId: DEAL_ID,
      fromStageId: QUALIFIED_STAGE_ID,
      toStageId: PROPOSAL_STAGE_ID,
      enteredAt: MOVED_AT,
      userId: USER_ID,
    });
  });

  it("chains the closed row's exitedAt to the new row's enteredAt", async () => {
    const repo = makeRepo(openRow());

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
        stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
      }),
    );

    const { exitedAt } = repo.closeStageHistory.mock.calls[0][0];
    const { enteredAt } = repo.openStageHistory.mock.calls[0][0];

    expect(exitedAt).toBe(enteredAt);
    expect(enteredAt).toBe(MOVED_AT);
  });

  it("computes durationSeconds from the stored enteredAt to the stage boundary", async () => {
    const repo = makeRepo(openRow({ enteredAt: new Date("2026-09-03T01:00:00.000Z") }));

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
        stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
      }),
    );

    expect(repo.closeStageHistory.mock.calls[0][0].durationSeconds).toBe(1845);
  });

  it("never reports a negative duration when the boundary precedes the open row", async () => {
    const repo = makeRepo(openRow({ enteredAt: new Date("2026-09-04T00:00:00.000Z") }));

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
        stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
      }),
    );

    expect(repo.closeStageHistory.mock.calls[0][0].durationSeconds).toBe(0);
  });

  it("opens the first row without closing anything when no prior row exists", async () => {
    const repo = makeRepo(null);

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
        stageId: { previous: null, current: PROPOSAL_STAGE_ID },
      }),
    );

    expect(repo.closeStageHistory).not.toHaveBeenCalled();
    expect(repo.openStageHistory).toHaveBeenCalledExactlyOnceWith({
      dealId: DEAL_ID,
      fromStageId: null,
      toStageId: PROPOSAL_STAGE_ID,
      enteredAt: MOVED_AT,
      userId: USER_ID,
    });
  });

  it("opens the first row for a newly created deal", async () => {
    const repo = makeRepo(null);

    await makeListener(repo).handle(DomainEvent.DEAL_CREATED, dealCreated(makeDeal()));

    expect(repo.openStageHistory).toHaveBeenCalledExactlyOnceWith({
      dealId: DEAL_ID,
      fromStageId: null,
      toStageId: QUALIFIED_STAGE_ID,
      enteredAt: ENTERED_AT,
      userId: USER_ID,
    });
  });

  it("writes nothing for a created deal that has no stage", async () => {
    const repo = makeRepo(null);

    await makeListener(repo).handle(DomainEvent.DEAL_CREATED, dealCreated(makeDeal({ stageId: null })));

    expect(repo.openStageHistory).not.toHaveBeenCalled();
    expect(repo.closeStageHistory).not.toHaveBeenCalled();
  });

  it("records a row when a deal moves to a stage in another pipeline", async () => {
    const repo = makeRepo(openRow());

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ pipelineId: RENEWALS_PIPELINE_ID, stageId: RENEWAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
        pipelineId: { previous: NEW_BUSINESS_PIPELINE_ID, current: RENEWALS_PIPELINE_ID },
        stageId: { previous: QUALIFIED_STAGE_ID, current: RENEWAL_STAGE_ID },
      }),
    );

    expect(repo.closeStageHistory).toHaveBeenCalledTimes(1);
    expect(repo.openStageHistory).toHaveBeenCalledExactlyOnceWith({
      dealId: DEAL_ID,
      fromStageId: QUALIFIED_STAGE_ID,
      toStageId: RENEWAL_STAGE_ID,
      enteredAt: MOVED_AT,
      userId: USER_ID,
    });
  });

  it("closes the open row without opening a new one when the stage is cleared", async () => {
    const repo = makeRepo(openRow());

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: null, pipelineId: null, stageEnteredAt: MOVED_AT }), {
        stageId: { previous: QUALIFIED_STAGE_ID, current: null },
      }),
    );

    expect(repo.closeStageHistory).toHaveBeenCalledTimes(1);
    expect(repo.openStageHistory).not.toHaveBeenCalled();
  });

  it("does not duplicate a row when the open row already points at the current stage", async () => {
    const repo = makeRepo(openRow({ toStageId: PROPOSAL_STAGE_ID }));

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
        stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
      }),
    );

    expect(repo.closeStageHistory).not.toHaveBeenCalled();
    expect(repo.openStageHistory).not.toHaveBeenCalled();
  });

  it("falls back to the current time when the deal carries no stageEnteredAt", async () => {
    const repo = makeRepo(null);
    const before = Date.now();

    await makeListener(repo).handle(
      DomainEvent.DEAL_UPDATED,
      dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: null }), {
        stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
      }),
    );

    const { enteredAt } = repo.openStageHistory.mock.calls[0][0];

    expect(enteredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(enteredAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("returns quietly for an unexpected payload shape", async () => {
    const repo = makeRepo(openRow());
    const listener = makeListener(repo);

    await expect(
      listener.handle(DomainEvent.DEAL_UPDATED, {
        userId: USER_ID,
        companyId: COMPANY_ID,
        entityId: DEAL_ID,
        payload: { deal: null, changes: { stageId: { previous: null, current: PROPOSAL_STAGE_ID } } },
      } as unknown as DomainEventMap[DomainEvent.DEAL_UPDATED]),
    ).resolves.toBeUndefined();

    await expect(
      listener.handle(DomainEvent.DEAL_CREATED, undefined as unknown as DomainEventMap[DomainEvent.DEAL_CREATED]),
    ).resolves.toBeUndefined();

    await expect(listener.handle(DomainEvent.DEAL_CREATED, dealCreated({ name: "no id" }))).resolves.toBeUndefined();

    expect(repo.findOpenStageHistory).not.toHaveBeenCalled();
    expect(repo.openStageHistory).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("swallows a repository failure so the caller's transaction is not rolled back", async () => {
    const repo = makeRepo(openRow());
    const boom = new Error("deadlock detected");
    repo.openStageHistory.mockRejectedValue(boom);

    await expect(
      makeListener(repo).handle(
        DomainEvent.DEAL_UPDATED,
        dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID, stageEnteredAt: MOVED_AT }), {
          stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledExactlyOnceWith(boom, {
      tags: { kind: "deal-stage-history-failure" },
    });
  });

  it("swallows a failure while looking up the open row", async () => {
    const repo = makeRepo(null);
    repo.findOpenStageHistory.mockRejectedValue(new Error("connection reset"));

    await expect(
      makeListener(repo).handle(
        DomainEvent.DEAL_UPDATED,
        dealUpdated(makeDeal({ stageId: PROPOSAL_STAGE_ID }), {
          stageId: { previous: QUALIFIED_STAGE_ID, current: PROPOSAL_STAGE_ID },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("opens the first row for a new deal without looking for an earlier one", async () => {
    const repo = makeRepo(null);

    await makeListener(repo).handle(DomainEvent.DEAL_CREATED, dealCreated(makeDeal()));

    expect(repo.findOpenStageHistory).not.toHaveBeenCalled();
    expect(repo.openStageHistory).toHaveBeenCalledTimes(1);
  });
});
