import type { GetMailboxThreadsData } from "../mailbox.schema";

export type MailboxThreadFilter = {
  search: string | null;
  folder: string | null;
};

function presentText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function toMailboxThreadFilter(data: GetMailboxThreadsData): MailboxThreadFilter {
  return { search: presentText(data.query), folder: presentText(data.folder) };
}
