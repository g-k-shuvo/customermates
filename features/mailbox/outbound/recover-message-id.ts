export const STORED_MESSAGE_ID_PREFIX = "imap:msg:id:";

export function recoverRfcMessageId(storedId: string | null | undefined): string | null {
  if (typeof storedId !== "string" || !storedId.startsWith(STORED_MESSAGE_ID_PREFIX)) return null;

  const raw = storedId.slice(STORED_MESSAGE_ID_PREFIX.length).trim();
  if (raw.length === 0 || !raw.includes("@")) return null;

  const bare = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1).trim() : raw;
  if (bare.length === 0 || /[\s<>]/.test(bare)) return null;

  return `<${bare}>`;
}

export function recoverThreadRootMessageId(threadKey: string | null | undefined): string | null {
  const prefix = "imap:thread:";
  if (typeof threadKey !== "string" || !threadKey.startsWith(prefix)) return null;

  const bare = threadKey.slice(prefix.length).trim();
  if (bare.length === 0 || !bare.includes("@") || /[\s<>]/.test(bare)) return null;

  return `<${bare}>`;
}
