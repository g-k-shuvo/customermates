import type { Validated } from "@/core/validation/validation.utils";
import type { DueMailOutboxRepo, DueOutboxMessage } from "../mail-workspace.repo";
import type { SendDueOutboxResult } from "../mail-workspace.schema";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import {
  MAIL_OUTBOX_BATCH,
  MAIL_OUTBOX_MAX_ATTEMPTS,
  MAIL_OUTBOX_RETRY_DELAY_MS,
  MAIL_OUTBOX_STALE_CLAIM_MS,
} from "../mail-workspace.schema";

export type OutboxDeliveryOutcome = { ok: true } | { ok: false; error: string };

export type OutboxDelivery = (message: DueOutboxMessage) => Promise<OutboxDeliveryOutcome>;

export const OUTBOX_UNEXPECTED_ERROR = "unexpected";

@SystemInteractor
export class SendDueOutboxInteractor {
  constructor(
    private repo: DueMailOutboxRepo,
    private deliver: OutboxDelivery,
    private now: () => Date,
  ) {}

  async invoke(): Validated<SendDueOutboxResult> {
    const now = this.now();
    const due = await this.repo.claimDueOutboxMessagesUnscoped(
      now,
      new Date(now.getTime() - MAIL_OUTBOX_STALE_CLAIM_MS),
      MAIL_OUTBOX_BATCH,
    );
    const result: SendDueOutboxResult = { sent: 0, retried: 0, failed: 0 };

    for (const message of due) {
      const outcome = await this.deliver(message).catch(
        (): OutboxDeliveryOutcome => ({ ok: false, error: OUTBOX_UNEXPECTED_ERROR }),
      );

      if (outcome.ok) {
        await this.repo.markOutboxSentUnscoped(message, this.now());
        result.sent += 1;
        continue;
      }

      const attempt = message.attempts + 1;
      const retryAt =
        attempt < MAIL_OUTBOX_MAX_ATTEMPTS
          ? new Date(this.now().getTime() + MAIL_OUTBOX_RETRY_DELAY_MS * attempt)
          : null;
      await this.repo.markOutboxAttemptFailedUnscoped(message, { error: outcome.error, retryAt });
      if (retryAt) result.retried += 1;
      else result.failed += 1;
    }

    return { ok: true as const, data: result };
  }
}
