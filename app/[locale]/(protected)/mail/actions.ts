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

import {
  getForwardThreadInteractor,
  getGetMailboxThreadInteractor,
  getGetMailboxThreadsInteractor,
  getGetRecordThreadsInteractor,
  getLinkThreadDealInteractor,
  getSendReplyInteractor,
  getShareThreadInteractor,
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
