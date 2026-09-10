"use server";

import type { ConnectMailboxData, DisconnectMailboxData, SyncMailboxData } from "@/features/mailbox/mailbox.schema";

import {
  getAdminDisconnectMailboxInteractor,
  getConnectMailboxInteractor,
  getDisconnectMailboxInteractor,
  getGetMailboxAccountsInteractor,
  getSyncMailboxInteractor,
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

export async function syncMailboxAction(input: SyncMailboxData) {
  return serializeResult(getSyncMailboxInteractor().invoke(input));
}
