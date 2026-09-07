import type { ParsedSourceMessage } from "./parse-source";
import { threadKey, type ThreadKeySource } from "./thread-key";

export const ORPHAN_THREAD_KEY_PREFIX = "imap:thread:uid:";

export type PlannedMessage = {
  uid: number;
  parsed: ParsedSourceMessage;
  threadKeySource: ThreadKeySource | "uid";
};

export type PlannedThread = {
  threadKey: string;
  subject: string | null;
  messages: PlannedMessage[];
};

export type MailboxSyncPlan = {
  threads: PlannedThread[];
  messageCount: number;
};

function timestampOf(parsed: ParsedSourceMessage): number {
  const candidates = [parsed.message.date, parsed.message.receivedAt];

  for (const candidate of candidates) {
    if (candidate instanceof Date) {
      const time = candidate.getTime();
      if (!Number.isNaN(time)) return time;
    }

    if (typeof candidate === "string" || typeof candidate === "number") {
      const time = new Date(candidate).getTime();
      if (!Number.isNaN(time)) return time;
    }
  }

  return Number.POSITIVE_INFINITY;
}

function firstSubject(messages: readonly PlannedMessage[]): string | null {
  for (const entry of messages) {
    const subject = entry.parsed.message.subject;
    if (typeof subject === "string" && subject.trim().length > 0) return subject;
  }

  return null;
}

function keyFor(parsed: ParsedSourceMessage): { value: string; source: ThreadKeySource | "uid" } {
  const derived = threadKey(parsed.threading);
  if (derived) return { value: derived.value, source: derived.source };

  return { value: `${ORPHAN_THREAD_KEY_PREFIX}${parsed.uid}`, source: "uid" };
}

export function planMailboxSync(parsed: readonly ParsedSourceMessage[]): MailboxSyncPlan {
  const byKey = new Map<string, PlannedMessage[]>();

  for (const entry of parsed) {
    const key = keyFor(entry);
    const bucket = byKey.get(key.value) ?? [];

    bucket.push({ uid: entry.uid, parsed: entry, threadKeySource: key.source });
    byKey.set(key.value, bucket);
  }

  const threads: PlannedThread[] = [];
  let messageCount = 0;

  for (const [key, bucket] of byKey) {
    const ordered = [...bucket].sort((left, right) => {
      const difference = timestampOf(left.parsed) - timestampOf(right.parsed);

      return difference === 0 || Number.isNaN(difference) ? left.uid - right.uid : difference;
    });

    messageCount += ordered.length;
    threads.push({ threadKey: key, subject: firstSubject(ordered), messages: ordered });
  }

  return { threads, messageCount };
}
