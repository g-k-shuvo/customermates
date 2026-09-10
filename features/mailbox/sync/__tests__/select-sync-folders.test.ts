import { describe, expect, it } from "vitest";

import type { MailboxFolder } from "../mailbox-transport";

import { DEFAULT_SYNC_FOLDER, MAX_SYNC_FOLDERS, selectSyncFolders } from "../select-sync-folders";

function folder(path: string, specialUse: string | null = null, subscribed = true): MailboxFolder {
  return { path, name: path, specialUse, subscribed };
}

describe("selectSyncFolders", () => {
  it("syncs the inbox first, then the sent and archive folders the server reports", () => {
    const selected = selectSyncFolders([folder("Archive", "\\Archive"), folder("Sent", "\\Sent"), folder("INBOX")]);

    expect(selected).toEqual(["INBOX", "Sent", "Archive"]);
  });

  it("leaves out the folders that only duplicate or discard mail", () => {
    const selected = selectSyncFolders([
      folder("INBOX"),
      folder("Trash", "\\Trash"),
      folder("Spam", "\\Junk"),
      folder("Drafts", "\\Drafts"),
      folder("All Mail", "\\All"),
    ]);

    expect(selected).toEqual(["INBOX"]);
  });

  it("keeps the subscribed folders of the user's own making, in a stable order", () => {
    const selected = selectSyncFolders([folder("Clients"), folder("INBOX"), folder("Applications")]);

    expect(selected).toEqual(["INBOX", "Applications", "Clients"]);
  });

  it("ignores folders the mailbox owner has not subscribed to", () => {
    const selected = selectSyncFolders([folder("INBOX"), folder("Noise", null, false)]);

    expect(selected).toEqual(["INBOX"]);
  });

  it("still syncs the inbox when the server lists no folder at all", () => {
    expect(selectSyncFolders([])).toEqual([DEFAULT_SYNC_FOLDER]);
  });

  it("caps how many folders one run walks", () => {
    const many = Array.from({ length: 30 }, (_, index) => folder(`Folder${String(index).padStart(2, "0")}`));

    expect(selectSyncFolders([folder("INBOX"), ...many])).toHaveLength(MAX_SYNC_FOLDERS);
  });
});
