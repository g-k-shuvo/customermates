import type { MailboxFolder } from "./mailbox-transport";

export const DEFAULT_SYNC_FOLDER = "INBOX";
export const MAX_SYNC_FOLDERS = 10;

const PREFERRED_SPECIAL_USE = ["\\Sent", "\\Archive"];
const SKIPPED_SPECIAL_USE = new Set(["\\Trash", "\\Junk", "\\Drafts", "\\All", "\\Important", "\\Flagged"]);

function isInbox(folder: MailboxFolder): boolean {
  return folder.path.toUpperCase() === DEFAULT_SYNC_FOLDER;
}

function byPath(left: MailboxFolder, right: MailboxFolder): number {
  if (left.path === right.path) return 0;

  return left.path < right.path ? -1 : 1;
}

export function selectSyncFolders(folders: readonly MailboxFolder[]): string[] {
  const usable = folders.filter((folder) => !folder.specialUse || !SKIPPED_SPECIAL_USE.has(folder.specialUse));
  const inbox = usable.find(isInbox);
  const preferred = PREFERRED_SPECIAL_USE.flatMap((specialUse) =>
    usable.filter((folder) => folder.specialUse === specialUse),
  );
  const rest = usable
    .filter((folder) => !isInbox(folder) && !preferred.includes(folder) && folder.subscribed)
    .sort(byPath);

  const ordered = [...(inbox ? [inbox] : []), ...preferred, ...rest].map((folder) => folder.path);
  const deduped: string[] = [];

  for (const path of ordered) if (!deduped.includes(path)) deduped.push(path);
  if (!deduped.includes(DEFAULT_SYNC_FOLDER) && !inbox) deduped.unshift(DEFAULT_SYNC_FOLDER);

  return deduped.slice(0, MAX_SYNC_FOLDERS);
}
