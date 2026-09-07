"use server";

import type { GetMailboxThreadData, GetRecordThreadsData, ShareThreadData } from "@/features/mailbox/mailbox.schema";

import {
  getGetMailboxThreadInteractor,
  getGetMailboxThreadsInteractor,
  getGetRecordThreadsInteractor,
  getShareThreadInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getMailboxThreadsAction() {
  return serializeResult(getGetMailboxThreadsInteractor().invoke());
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
