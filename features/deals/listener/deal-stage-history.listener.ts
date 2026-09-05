import type { DomainEventHandlers } from "@/features/event/domain-event.listener";

import * as Sentry from "@sentry/nextjs";

import { DomainEvent } from "@/features/event/domain-events";
import { DomainEventListener } from "@/features/event/domain-event.listener";
import { transactionStorage } from "@/core/decorators/transaction-context";

export type OpenStageHistory = { id: string; toStageId: string; enteredAt: Date };

export abstract class DealStageHistoryRepo {
  abstract findOpenStageHistory(dealId: string): Promise<OpenStageHistory | null>;
  abstract closeStageHistory(args: { id: string; exitedAt: Date; durationSeconds: number }): Promise<void>;
  abstract openStageHistory(args: {
    dealId: string;
    fromStageId: string | null;
    toStageId: string;
    enteredAt: Date;
    userId: string | null;
  }): Promise<void>;
}

type StagedDeal = { id: string; stageId: string | null; stageEnteredAt: Date | null };

type ReadStagedDeal = (payload: unknown) => StagedDeal | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const readCreatedDeal: ReadStagedDeal = (payload) => {
  if (!isRecord(payload) || typeof payload.id !== "string") return null;

  return {
    id: payload.id,
    stageId: typeof payload.stageId === "string" ? payload.stageId : null,
    stageEnteredAt: payload.stageEnteredAt instanceof Date ? payload.stageEnteredAt : null,
  };
};

const readStageChangedDeal: ReadStagedDeal = (payload) => {
  if (!isRecord(payload) || !isRecord(payload.changes) || !("stageId" in payload.changes)) return null;

  return readCreatedDeal(payload.deal);
};

function secondsBetween(enteredAt: Date, exitedAt: Date): number {
  return Math.max(0, Math.round((exitedAt.getTime() - enteredAt.getTime()) / 1000));
}

export class DealStageHistoryListener extends DomainEventListener {
  readonly handlers: DomainEventHandlers;

  constructor(private repo: DealStageHistoryRepo) {
    super();

    this.handlers = {
      [DomainEvent.DEAL_CREATED]: (event) => this.record(event, readCreatedDeal, true),
      [DomainEvent.DEAL_UPDATED]: (event) => this.record(event, readStageChangedDeal, false),
    };
  }

  private async record(event: unknown, readDeal: ReadStagedDeal, isNewDeal: boolean): Promise<void> {
    try {
      if (!isRecord(event)) return;

      const deal = readDeal(event.payload);
      if (!deal) return;

      const userId = typeof event.userId === "string" ? event.userId : null;
      const store = transactionStorage.getStore();

      if (store) {
        store.afterCommit.push(() => this.rotateQuietly(deal, userId, isNewDeal));
        return;
      }

      await this.rotateQuietly(deal, userId, isNewDeal);
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "deal-stage-history-failure" } });
    }
  }

  private async rotateQuietly(deal: StagedDeal, userId: string | null, isNewDeal: boolean): Promise<void> {
    try {
      await this.rotate(deal, userId, isNewDeal);
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "deal-stage-history-failure" } });
    }
  }

  private async rotate(deal: StagedDeal, userId: string | null, isNewDeal: boolean): Promise<void> {
    const boundary = deal.stageEnteredAt ?? new Date();

    if (isNewDeal) {
      if (deal.stageId) {
        await this.repo.openStageHistory({
          dealId: deal.id,
          fromStageId: null,
          toStageId: deal.stageId,
          enteredAt: boundary,
          userId,
        });
      }

      return;
    }

    const open = await this.repo.findOpenStageHistory(deal.id);

    if (open?.toStageId === deal.stageId) return;

    if (open) {
      const exitedAt = boundary < open.enteredAt ? open.enteredAt : boundary;

      await this.repo.closeStageHistory({
        id: open.id,
        exitedAt,
        durationSeconds: secondsBetween(open.enteredAt, exitedAt),
      });
    }

    if (!deal.stageId) return;

    await this.repo.openStageHistory({
      dealId: deal.id,
      fromStageId: open?.toStageId ?? null,
      toStageId: deal.stageId,
      enteredAt: boundary,
      userId,
    });
  }
}
