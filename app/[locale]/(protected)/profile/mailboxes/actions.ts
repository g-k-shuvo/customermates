"use server";

import type {
  ConnectMailboxData,
  DisconnectMailboxData,
  MailboxAccountRefData,
  SyncMailboxData,
} from "@/features/mailbox/mailbox.schema";
import type { MailLabelIdData, UpsertMailLabelData } from "@/features/mail-workspace/mail-workspace.schema";
import type { SetMailboxCalendarSyncData } from "@/features/mailbox-calendar/mailbox-calendar.schema";

import {
  getAdminDisconnectMailboxInteractor,
  getConnectMailboxInteractor,
  getDisconnectMailboxInteractor,
  getGetMailboxAccountsInteractor,
  getListSyncFoldersInteractor,
  getSyncMailboxInteractor,
  getDeleteMailLabelInteractor,
  getGetMailLabelsInteractor,
  getUpsertMailLabelInteractor,
  getSetMailboxCalendarSyncInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getMailboxAccountsAction() {
  return serializeResult(getGetMailboxAccountsInteractor().invoke());
}

export async function connectMailboxAction(input: ConnectMailboxData) {
  return serializeResult(getConnectMailboxInteractor().invoke(input));
}

export async function disconnectMailboxAction(input: DisconnectMailboxData) {
  return serializeResult(getDisconnectMailboxInteractor().invoke(input));
}

export async function adminDisconnectMailboxAction(input: DisconnectMailboxData) {
  return serializeResult(getAdminDisconnectMailboxInteractor().invoke(input));
}

export async function listSyncFoldersAction(input: MailboxAccountRefData) {
  return serializeResult(getListSyncFoldersInteractor().invoke(input));
}

export async function syncMailboxAction(input: SyncMailboxData) {
  return serializeResult(getSyncMailboxInteractor().invoke(input));
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

export async function setMailboxCalendarSyncAction(input: SetMailboxCalendarSyncData) {
  return serializeResult(getSetMailboxCalendarSyncInteractor().invoke(input));
}
