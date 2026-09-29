import type { OutboxDelivery } from "@/features/mail-workspace/outbox/send-due-outbox.interactor";
import type { SendDueOutboxResult } from "@/features/mail-workspace/mail-workspace.schema";

import { getForwardThreadInteractor, getSendDueOutboxInteractor, getSendReplyInteractor } from "@/core/di";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { serializeInteractorFailure } from "@/core/validation/validation.utils";
import { OUTBOX_UNEXPECTED_ERROR } from "@/features/mail-workspace/outbox/send-due-outbox.interactor";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "send-mail-outbox";

export type SendMailOutboxPayload = Record<string, never>;

async function sendDueOutbox(): Promise<SendDueOutboxResult> {
  "use step";

  const deliverAsOwner: OutboxDelivery = (message) =>
    runAsBackgroundTenant(message.userId, async () => {
      const result =
        message.mode === "forward"
          ? await getForwardThreadInteractor().invoke({
              threadId: message.threadId,
              to: message.recipients,
              body: message.body,
            })
          : await getSendReplyInteractor().invoke({
              threadId: message.threadId,
              body: message.body,
              replyAll: message.replyAll,
            });

      if (result.ok) return { ok: true as const };

      const code = serializeInteractorFailure(result.error).issues.find((issue) => issue.customCode)?.customCode;

      return { ok: false as const, error: code ?? OUTBOX_UNEXPECTED_ERROR };
    });

  const outcome = await getSendDueOutboxInteractor(deliverAsOwner).invoke();

  return outcome.ok ? outcome.data : { sent: 0, retried: 0, failed: 0 };
}
sendDueOutbox.maxRetries = 0;

export async function sendMailOutbox(payload: SendMailOutboxPayload): Promise<SendDueOutboxResult> {
  "use workflow";
  void payload;

  try {
    return await sendDueOutbox();
  } catch (error) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error));

    return { sent: 0, retried: 0, failed: 0 };
  }
}
