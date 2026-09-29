"use server";

import type {
  ForwardThreadData,
  GetMailboxThreadData,
  GetMailboxThreadsData,
  GetRecordThreadsData,
  LinkThreadDealData,
  SendReplyData,
  ShareThreadData,
} from "@/features/mailbox/mailbox.schema";
import type {
  MailComposeData,
  MailLabelIdData,
  OutboxMessageIdData,
  ScheduleMailData,
  SetThreadArchivedData,
  SetThreadFollowUpData,
  SetThreadLabelsData,
  ThreadIdData,
  UpsertMailLabelData,
} from "@/features/mail-workspace/mail-workspace.schema";

import {
  getForwardThreadInteractor,
  getGetMailboxThreadInteractor,
  getGetMailboxThreadsInteractor,
  getGetRecordThreadsInteractor,
  getLinkThreadDealInteractor,
  getSendReplyInteractor,
  getShareThreadInteractor,
  getGetMailDraftInteractor,
  getSaveMailDraftInteractor,
  getDeleteMailDraftInteractor,
  getScheduleMailInteractor,
  getGetMailOutboxInteractor,
  getCancelOutboxMessageInteractor,
  getSendOutboxMessageNowInteractor,
  getSetThreadArchivedInteractor,
  getSetThreadFollowUpInteractor,
  getGetMailLabelsInteractor,
  getUpsertMailLabelInteractor,
  getDeleteMailLabelInteractor,
  getSetThreadLabelsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getMailboxThreadsAction(input: GetMailboxThreadsData) {
  return serializeResult(getGetMailboxThreadsInteractor().invoke(input));
}

export async function getMailboxThreadAction(input: GetMailboxThreadData) {
  return serializeResult(getGetMailboxThreadInteractor().invoke(input));
}

export async function getRecordThreadsAction(input: GetRecordThreadsData) {
  return serializeResult(getGetRecordThreadsInteractor().invoke(input));
}

export async function shareThreadAction(input: ShareThreadData) {
  return serializeResult(getShareThreadInteractor().invoke(input));
}

export async function linkThreadDealAction(input: LinkThreadDealData) {
  return serializeResult(getLinkThreadDealInteractor().invoke(input));
}

export async function sendReplyAction(input: SendReplyData) {
  return serializeResult(getSendReplyInteractor().invoke(input));
}

export async function forwardThreadAction(input: ForwardThreadData) {
  return serializeResult(getForwardThreadInteractor().invoke(input));
}

export async function getMailDraftAction(input: ThreadIdData) {
  return serializeResult(getGetMailDraftInteractor().invoke(input));
}

export async function saveMailDraftAction(input: MailComposeData) {
  return serializeResult(getSaveMailDraftInteractor().invoke(input));
}

export async function deleteMailDraftAction(input: ThreadIdData) {
  return serializeResult(getDeleteMailDraftInteractor().invoke(input));
}

export async function scheduleMailAction(input: ScheduleMailData) {
  return serializeResult(getScheduleMailInteractor().invoke(input));
}

export async function getMailOutboxAction() {
  return serializeResult(getGetMailOutboxInteractor().invoke());
}

export async function cancelOutboxMessageAction(input: OutboxMessageIdData) {
  return serializeResult(getCancelOutboxMessageInteractor().invoke(input));
}

export async function sendOutboxMessageNowAction(input: OutboxMessageIdData) {
  return serializeResult(getSendOutboxMessageNowInteractor().invoke(input));
}

export async function setThreadArchivedAction(input: SetThreadArchivedData) {
  return serializeResult(getSetThreadArchivedInteractor().invoke(input));
}

export async function setThreadFollowUpAction(input: SetThreadFollowUpData) {
  return serializeResult(getSetThreadFollowUpInteractor().invoke(input));
}

export async function getMailLabelsAction() {
  return serializeResult(getGetMailLabelsInteractor().invoke());
}

export async function upsertMailLabelAction(input: UpsertMailLabelData) {
  return serializeResult(getUpsertMailLabelInteractor().invoke(input));
}

export async function deleteMailLabelAction(input: MailLabelIdData) {
  return serializeResult(getDeleteMailLabelInteractor().invoke(input));
}

export async function setThreadLabelsAction(input: SetThreadLabelsData) {
  return serializeResult(getSetThreadLabelsInteractor().invoke(input));
}
